"""Arena concurrency manager.

Rules (The M1 Constraint):
- Two local Ollama models  → sequential execution (preserve VRAM)
- At least one cloud model → concurrent execution via asyncio
"""
from __future__ import annotations

import asyncio
import json
import logging
import time
from typing import Any, AsyncIterator

from sqlalchemy.ext.asyncio import AsyncSession
from starlette.requests import Request

from app.services.litellm_router import (
    build_completion_kwargs,
    chat_completion_stream,
    is_model_local,
    apply_mode_overrides,
    sanitize_kwargs_for_provider,
)
from app.services.metrics import StreamMetricsCollector

logger = logging.getLogger(__name__)


async def _stream_and_collect(
    kwargs: dict[str, Any],
    model_id: str,
) -> tuple[str, list[dict[str, Any]], StreamMetricsCollector]:
    """Stream a single model, collecting full text + raw SSE chunks + metrics."""
    metrics = StreamMetricsCollector(model_id)
    chunks: list[dict[str, Any]] = []
    full_text = ""

    metrics.start()
    async for chunk in chat_completion_stream(kwargs):
        metrics.on_chunk(chunk)
        delta = chunk.choices[0].delta if chunk.choices else None
        if delta and delta.content:
            full_text += delta.content
        # Serialize chunk for SSE forwarding
        chunks.append({
            "model": model_id,
            "chunk": _serialize_chunk(chunk),
        })
    metrics.finish()
    return full_text, chunks, metrics


def _serialize_chunk(chunk: Any) -> dict[str, Any]:
    """Convert a litellm chunk to a JSON-serialisable dict."""
    try:
        return chunk.model_dump()
    except Exception:
        return {"content": str(chunk)}


async def run_arena(
    model_a: str,
    model_b: str,
    messages: list[dict[str, Any]],
    session: AsyncSession,
    *,
    temperature: float = 0.7,
    max_tokens: int = 2048,
    top_p: float = 1.0,
    mode: str | None = None,
    system_prompt: str | None = None,
    request: Request | None = None,
) -> AsyncIterator[str]:
    """Execute arena comparison, yielding newline-delimited JSON events.

    Event types:
      {"type": "chunk", "model": "...", "data": {...}}
      {"type": "metrics", "model": "...", "data": {...}}
      {"type": "done"}
    """
    # Prepend system prompt
    msgs = list(messages)
    if system_prompt:
        msgs = [{"role": "system", "content": system_prompt}] + msgs
    msg_dicts = [m if isinstance(m, dict) else m.dict() for m in msgs]

    kwargs_a = await build_completion_kwargs(
        model_a, msg_dicts, session,
        temperature=temperature, max_tokens=max_tokens, top_p=top_p, stream=True,
    )
    kwargs_a = apply_mode_overrides(mode, kwargs_a)
    kwargs_b = await build_completion_kwargs(
        model_b, msg_dicts, session,
        temperature=temperature, max_tokens=max_tokens, top_p=top_p, stream=True,
    )
    kwargs_b = apply_mode_overrides(mode, kwargs_b)

    a_local = await is_model_local(model_a, session)
    b_local = await is_model_local(model_b, session)
    both_local = a_local and b_local

    if both_local:
        # Sequential: avoid VRAM exhaustion
        logger.info("Arena: sequential mode (both local)")
        async for event in _run_sequential(kwargs_a, kwargs_b, model_a, model_b, request):
            yield event
    else:
        # Concurrent
        logger.info("Arena: concurrent mode (at least one cloud)")
        async for event in _run_concurrent(kwargs_a, kwargs_b, model_a, model_b, request):
            yield event


async def _run_sequential(
    kwargs_a: dict, kwargs_b: dict, model_a: str, model_b: str,
    request: Request | None = None,
) -> AsyncIterator[str]:
    """Run model A fully, then model B."""
    try:
        for model_id, kwargs in [(model_a, kwargs_a), (model_b, kwargs_b)]:
            metrics = StreamMetricsCollector(model_id)
            metrics.start()
            async for chunk in chat_completion_stream(kwargs):
                if request and await request.is_disconnected():
                    logger.info("Arena sequential: client disconnected during %s", model_id)
                    return
                metrics.on_chunk(chunk)
                yield json.dumps({
                    "type": "chunk",
                    "model": model_id,
                    "data": _serialize_chunk(chunk),
                }) + "\n"
            metrics.finish()
            yield json.dumps({
                "type": "metrics",
                "model": model_id,
                "data": metrics.to_dict(),
            }) + "\n"

        yield json.dumps({"type": "done"}) + "\n"
    except (asyncio.CancelledError, GeneratorExit):
        logger.info("Arena sequential: client disconnected")
        return


async def _run_concurrent(
    kwargs_a: dict, kwargs_b: dict, model_a: str, model_b: str,
    request: Request | None = None,
) -> AsyncIterator[str]:
    """Run both models concurrently using asyncio tasks."""
    queue: asyncio.Queue[str | None] = asyncio.Queue()

    async def _stream_to_queue(kwargs: dict, model_id: str):
        metrics = StreamMetricsCollector(model_id)
        metrics.start()
        try:
            async for chunk in chat_completion_stream(kwargs):
                metrics.on_chunk(chunk)
                await queue.put(json.dumps({
                    "type": "chunk",
                    "model": model_id,
                    "data": _serialize_chunk(chunk),
                }) + "\n")
        except (asyncio.CancelledError, GeneratorExit):
            logger.info("Arena concurrent: stream cancelled for %s", model_id)
        except Exception as e:
            try:
                await queue.put(json.dumps({
                    "type": "error",
                    "model": model_id,
                    "data": {"error": str(e)},
                }) + "\n")
            except (asyncio.CancelledError, GeneratorExit):
                pass
        finally:
            metrics.finish()
            try:
                await queue.put(json.dumps({
                    "type": "metrics",
                    "model": model_id,
                    "data": metrics.to_dict(),
                }) + "\n")
                await queue.put(None)  # sentinel
            except (asyncio.CancelledError, GeneratorExit):
                pass

    task_a = asyncio.create_task(_stream_to_queue(kwargs_a, model_a))
    task_b = asyncio.create_task(_stream_to_queue(kwargs_b, model_b))

    try:
        finished = 0
        while finished < 2:
            item = await queue.get()
            if item is None:
                finished += 1
            else:
                yield item

        yield json.dumps({"type": "done"}) + "\n"
    except (asyncio.CancelledError, GeneratorExit):
        task_a.cancel()
        task_b.cancel()
        logger.info("Arena concurrent: client disconnected")
        return
