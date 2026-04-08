"""Conversation & message history — /v1/conversations"""
from __future__ import annotations

import datetime
from typing import Optional

from fastapi import APIRouter, Depends, HTTPException, Query, Response
from sqlalchemy.ext.asyncio import AsyncSession
from sqlmodel import select

from app.database import get_session
from app.models import Conversation, Message
from app.schemas import ConversationCreate, ConversationRead, ConversationUpdate, MessageRead

router = APIRouter(prefix="/v1/conversations", tags=["conversations"])


@router.get("", response_model=list[ConversationRead])
async def list_conversations(session: AsyncSession = Depends(get_session)):
    result = await session.execute(
        select(Conversation).order_by(Conversation.updated_at.desc())
    )
    convos = result.scalars().all()
    return [
        ConversationRead(
            id=c.id,
            title=c.title,
            model_id=c.model_id,
            created_at=c.created_at.isoformat(),
            updated_at=c.updated_at.isoformat(),
        )
        for c in convos
    ]


@router.post("", response_model=ConversationRead, status_code=201)
async def create_conversation(
    body: ConversationCreate,
    session: AsyncSession = Depends(get_session),
):
    convo = Conversation(title=body.title, model_id=body.model_id)
    session.add(convo)
    await session.commit()
    await session.refresh(convo)
    return ConversationRead(
        id=convo.id,
        title=convo.title,
        model_id=convo.model_id,
        created_at=convo.created_at.isoformat(),
        updated_at=convo.updated_at.isoformat(),
    )


@router.get("/search")
async def search_conversations(
    q: str = Query(..., min_length=1),
    session: AsyncSession = Depends(get_session),
):
    """Search conversations by title and message content."""
    query_lower = q.lower()
    like_pattern = f"%{q}%"

    convo_result = await session.execute(
        select(Conversation).order_by(Conversation.updated_at.desc())
    )
    all_convos = convo_result.scalars().all()

    exact_title = []
    partial_title = []
    content_match = []

    for c in all_convos:
        title_lower = c.title.lower()

        if title_lower == query_lower:
            exact_title.append({"convo": c, "excerpt": None})
            continue

        if query_lower in title_lower:
            partial_title.append({"convo": c, "excerpt": None})
            continue

        msg_result = await session.execute(
            select(Message)
            .where(Message.conversation_id == c.id)
            .where(Message.content.ilike(like_pattern))
            .order_by(Message.created_at.asc())
            .limit(1)
        )
        msg = msg_result.scalars().first()
        if msg:
            content = msg.content
            idx = content.lower().find(query_lower)
            excerpt = None
            if idx != -1:
                start = max(0, idx - 40)
                end = min(len(content), idx + len(q) + 80)
                snippet = content[start:end]
                match_start = idx - start
                snippet = (
                    snippet[:match_start]
                    + "**" + snippet[match_start:match_start + len(q)] + "**"
                    + snippet[match_start + len(q):]
                )
                if start > 0:
                    snippet = "..." + snippet
                if end < len(content):
                    snippet = snippet + "..."
                excerpt = snippet[:120]
            content_match.append({"convo": c, "excerpt": excerpt})

    results = []
    for group in [exact_title, partial_title, content_match]:
        for item in group:
            c = item["convo"]
            results.append({
                "id": c.id,
                "title": c.title,
                "model_id": c.model_id,
                "created_at": c.created_at.isoformat(),
                "updated_at": c.updated_at.isoformat(),
                "excerpt": item["excerpt"],
            })

    return results


@router.get("/{convo_id}/messages", response_model=list[MessageRead])
async def list_messages(convo_id: str, session: AsyncSession = Depends(get_session)):
    result = await session.execute(
        select(Message)
        .where(Message.conversation_id == convo_id)
        .order_by(Message.created_at.asc())
    )
    msgs = result.scalars().all()
    return [
        MessageRead(
            id=m.id,
            conversation_id=m.conversation_id,
            role=m.role,
            content=m.content,
            model_id=m.model_id,
            tokens_prompt=m.tokens_prompt,
            tokens_completion=m.tokens_completion,
            tps=m.tps,
            ttft_ms=m.ttft_ms,
            created_at=m.created_at.isoformat(),
        )
        for m in msgs
    ]


@router.post("/{convo_id}/messages", response_model=MessageRead, status_code=201)
async def create_message(
    convo_id: str,
    role: str,
    content: str,
    model_id: str = "",
    session: AsyncSession = Depends(get_session),
):
    # Verify conversation exists
    result = await session.execute(
        select(Conversation).where(Conversation.id == convo_id)
    )
    convo = result.scalars().first()
    if not convo:
        raise HTTPException(404, "Conversation not found")

    msg = Message(
        conversation_id=convo_id,
        role=role,
        content=content,
        model_id=model_id,
    )
    session.add(msg)

    # Update conversation timestamp
    convo.updated_at = datetime.datetime.now(datetime.timezone.utc)
    session.add(convo)
    await session.commit()
    await session.refresh(msg)

    return MessageRead(
        id=msg.id,
        conversation_id=msg.conversation_id,
        role=msg.role,
        content=msg.content,
        model_id=msg.model_id,
        tokens_prompt=msg.tokens_prompt,
        tokens_completion=msg.tokens_completion,
        tps=msg.tps,
        ttft_ms=msg.ttft_ms,
        created_at=msg.created_at.isoformat(),
    )


@router.patch("/{convo_id}", response_model=ConversationRead)
async def update_conversation(
    convo_id: str,
    body: ConversationUpdate,
    session: AsyncSession = Depends(get_session),
):
    result = await session.execute(
        select(Conversation).where(Conversation.id == convo_id)
    )
    convo = result.scalars().first()
    if not convo:
        raise HTTPException(404, "Conversation not found")

    if body.title is not None:
        convo.title = body.title
    convo.updated_at = datetime.datetime.now(datetime.timezone.utc)
    session.add(convo)
    await session.commit()
    await session.refresh(convo)
    return ConversationRead(
        id=convo.id,
        title=convo.title,
        model_id=convo.model_id,
        created_at=convo.created_at.isoformat(),
        updated_at=convo.updated_at.isoformat(),
    )


@router.delete("/{convo_id}", status_code=204)
async def delete_conversation(convo_id: str, session: AsyncSession = Depends(get_session)):
    result = await session.execute(
        select(Conversation).where(Conversation.id == convo_id)
    )
    convo = result.scalars().first()
    if not convo:
        raise HTTPException(404, "Conversation not found")

    # Delete messages first
    msg_result = await session.execute(
        select(Message).where(Message.conversation_id == convo_id)
    )
    for msg in msg_result.scalars().all():
        await session.delete(msg)

    await session.delete(convo)
    await session.commit()
    return Response(status_code=204)
