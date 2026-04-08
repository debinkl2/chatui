"""Arena router — /v1/arena/completions

Split-screen comparison of two models with concurrency management.
"""
from __future__ import annotations

from fastapi import APIRouter, Depends, HTTPException, Request
from sqlalchemy.ext.asyncio import AsyncSession
from starlette.responses import StreamingResponse

from app.database import get_session
from app.schemas import ArenaRequest
from app.services.concurrency import run_arena

router = APIRouter(tags=["arena"])


@router.post("/v1/arena/completions")
async def arena_completions(
    req: ArenaRequest,
    request: Request,
    session: AsyncSession = Depends(get_session),
):
    if req.model_a == req.model_b:
        raise HTTPException(400, "Arena requires two different models. Both sides have the same model selected.")
    messages = []
    if req.system_prompt:
        messages.append({"role": "system", "content": req.system_prompt})
    if req.context_documents:
        context_text = "\n\n---\n\n".join(req.context_documents)
        messages.append({
            "role": "system",
            "content": f"The following documents have been provided as context:\n\n{context_text}",
        })
    for m in req.messages:
        messages.append(m.model_dump(exclude_none=True))

    return StreamingResponse(
        run_arena(
            model_a=req.model_a,
            model_b=req.model_b,
            messages=messages,
            session=session,
            temperature=req.temperature,
            max_tokens=req.max_tokens,
            top_p=req.top_p,
            mode=req.mode,
            request=request,
        ),
        media_type="text/event-stream",
    )
