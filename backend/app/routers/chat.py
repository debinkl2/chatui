"""Chat completions router — /v1/chat/completions

Provides an OpenAI-compatible streaming endpoint routed via LiteLLM.
Includes MCP tool-call execution loop.
"""
from __future__ import annotations

import asyncio
import datetime
import json
import logging
import time
from typing import Any

from fastapi import APIRouter, Depends, Request
from sqlalchemy.ext.asyncio import AsyncSession
from sqlmodel import select
from sse_starlette.sse import EventSourceResponse

from app.database import get_session
from app.models import Conversation, Message
from app.schemas import ChatRequest
from app.services.litellm_router import build_completion_kwargs, chat_completion_stream, chat_completion, apply_mode_overrides, sanitize_kwargs_for_provider
from app.services.mcp_client import get_all_mcp_tools, handle_tool_calls
from app.services.metrics import StreamMetricsCollector

logger = logging.getLogger(__name__)
router = APIRouter(tags=["chat"])

MAX_TOOL_ROUNDS = 5  # prevent infinite tool-call loops


@router.post("/v1/chat/completions")
async def chat_completions(
    req: ChatRequest,
    request: Request,
    session: AsyncSession = Depends(get_session),
):
    messages = _prepare_messages(req)

    # Load MCP tools
    mcp_tools, tool_server_map = await get_all_mcp_tools(session)
    tools = mcp_tools if mcp_tools else None

    if req.stream:
        return EventSourceResponse(
            _stream_with_tools(req, messages, tools, tool_server_map, session, request),
            media_type="text/event-stream",
        )
    else:
        return await _non_stream_with_tools(req, messages, tools, tool_server_map, session)


def _prepare_messages(req: ChatRequest) -> list[dict[str, Any]]:
    msgs: list[dict[str, Any]] = []
    if req.system_prompt:
        msgs.append({"role": "system", "content": req.system_prompt})
    # Inject RAG context
    if req.context_documents:
        context_text = "\n\n---\n\n".join(req.context_documents)
        msgs.append({
            "role": "system",
            "content": f"The following documents have been provided as context:\n\n{context_text}",
        })
    for m in req.messages:
        msgs.append(m.model_dump(exclude_none=True))
    return msgs


async def _stream_with_tools(
    req: ChatRequest,
    messages: list[dict[str, Any]],
    tools: list[dict[str, Any]] | None,
    tool_server_map: dict[str, str],
    session: AsyncSession,
    request: Request | None = None,
):
    """Streaming generator with MCP tool-call loop."""
    current_messages = list(messages)
    metrics = StreamMetricsCollector(req.model)

    # Persist user message if conversation_id provided
    if req.conversation_id:
        user_content = ""
        for m in reversed(req.messages):
            if m.role == "user":
                user_content = m.content
                break
        if user_content:
            user_msg = Message(
                conversation_id=req.conversation_id,
                role="user",
                content=user_content,
            )
            session.add(user_msg)
            await session.commit()

    assistant_content = ""

    for _round in range(MAX_TOOL_ROUNDS):
        kwargs = await build_completion_kwargs(
            req.model, current_messages, session,
            temperature=req.temperature,
            max_tokens=req.max_tokens,
            top_p=req.top_p,
            stream=True,
            tools=tools,
        )
        kwargs = apply_mode_overrides(req.mode, kwargs)

        collected_tool_calls: list[dict[str, Any]] = []
        round_content = ""
        metrics.start()

        try:
            async for chunk in chat_completion_stream(kwargs):
                # Check for client disconnection
                if request and await request.is_disconnected():
                    logger.info("Client disconnected, stopping stream for model %s", req.model)
                    break
                metrics.on_chunk(chunk)
                choice = chunk.choices[0] if chunk.choices else None
                if not choice:
                    continue

                delta = choice.delta
                # Accumulate tool calls across chunks
                if hasattr(delta, "tool_calls") and delta.tool_calls:
                    for tc in delta.tool_calls:
                        idx = tc.index if hasattr(tc, "index") else 0
                        while len(collected_tool_calls) <= idx:
                            collected_tool_calls.append({"id": "", "function": {"name": "", "arguments": ""}})
                        if hasattr(tc, "id") and tc.id:
                            collected_tool_calls[idx]["id"] = tc.id
                        if hasattr(tc, "function") and tc.function:
                            if tc.function.name:
                                collected_tool_calls[idx]["function"]["name"] += tc.function.name
                            if tc.function.arguments:
                                collected_tool_calls[idx]["function"]["arguments"] += tc.function.arguments

                # Stream text content to client
                if delta and delta.content:
                    round_content += delta.content
                    assistant_content += delta.content
                    yield {"data": json.dumps({"content": delta.content})}

                # Check for finish
                if choice.finish_reason == "tool_calls" or (choice.finish_reason == "stop" and collected_tool_calls):
                    break
        except (asyncio.CancelledError, GeneratorExit):
            logger.info("Client disconnected during streaming for model %s", req.model)
            break
        except Exception as e:
            logger.error("Streaming error: %s", e)
            yield {"data": json.dumps({"content": f"\n\n**Error:** {e}"})}
            assistant_content += f"\n\nError: {e}"
            break

        metrics.finish()

        # If there are tool calls, execute them and loop
        if collected_tool_calls:
            current_messages.append({
                "role": "assistant",
                "content": round_content or None,
                "tool_calls": collected_tool_calls,
            })
            tool_results = await handle_tool_calls(collected_tool_calls, tool_server_map)
            current_messages.extend(tool_results)
            yield {"data": json.dumps({"tool_calls": collected_tool_calls, "tool_results": tool_results})}
            continue
        else:
            break

    # Persist assistant message if conversation_id provided
    if req.conversation_id and assistant_content:
        try:
            assistant_msg = Message(
                conversation_id=req.conversation_id,
                role="assistant",
                content=assistant_content,
                model_id=req.model,
                tps=metrics.tps,
                ttft_ms=metrics.ttft_ms,
            )
            session.add(assistant_msg)
            # Update conversation timestamp
            result = await session.execute(
                select(Conversation).where(Conversation.id == req.conversation_id)
            )
            convo = result.scalars().first()
            if convo:
                convo.updated_at = datetime.datetime.now(datetime.timezone.utc)
                session.add(convo)
            await session.commit()
        except Exception as e:
            logger.error("Failed to persist messages: %s", e)

    # Final metrics event
    yield {"data": json.dumps({
        "metrics": metrics.to_dict(),
        "done": True,
    })}


async def _non_stream_with_tools(
    req: ChatRequest,
    messages: list[dict[str, Any]],
    tools: list[dict[str, Any]] | None,
    tool_server_map: dict[str, str],
    session: AsyncSession,
) -> dict[str, Any]:
    """Non-streaming with tool-call loop."""
    current_messages = list(messages)

    for _round in range(MAX_TOOL_ROUNDS):
        kwargs = await build_completion_kwargs(
            req.model, current_messages, session,
            temperature=req.temperature,
            max_tokens=req.max_tokens,
            top_p=req.top_p,
            stream=False,
            tools=tools,
        )
        kwargs = apply_mode_overrides(req.mode, kwargs)
        response = await chat_completion(kwargs)
        choice = response.choices[0]
        msg = choice.message

        if msg.tool_calls:
            current_messages.append(msg.model_dump())
            tool_calls_raw = [tc.model_dump() for tc in msg.tool_calls]
            tool_results = await handle_tool_calls(tool_calls_raw, tool_server_map)
            current_messages.extend(tool_results)
            continue
        else:
            return {
                "content": msg.content,
                "model": req.model,
                "usage": response.usage.model_dump() if response.usage else {},
            }

    return {"content": "Max tool call rounds reached.", "model": req.model}
