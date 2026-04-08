"""Model registry CRUD — /v1/models"""
from __future__ import annotations

import logging

import httpx
from fastapi import APIRouter, Depends, HTTPException
from fastapi.responses import Response
from sqlalchemy.ext.asyncio import AsyncSession
from sqlmodel import select

from app.config import settings
from app.database import get_session
from app.models import ModelRecord, Provider
from app.schemas import ModelCreate, ModelRead

logger = logging.getLogger(__name__)

router = APIRouter(prefix="/v1/models", tags=["models"])


@router.get("", response_model=list[ModelRead])
async def list_models(session: AsyncSession = Depends(get_session)):
    # Debug: log total unfiltered count
    all_result = await session.execute(select(ModelRecord))
    total = len(all_result.scalars().all())
    logger.info("Total models in DB (unfiltered): %d", total)

    result = await session.execute(
        select(ModelRecord).where(ModelRecord.is_enabled == True)  # noqa: E712
    )
    models = result.scalars().all()
    logger.info("Enabled models returned: %d", len(models))
    return models


@router.post("", response_model=ModelRead, status_code=201)
async def create_model(body: ModelCreate, session: AsyncSession = Depends(get_session)):
    record = ModelRecord(**body.model_dump())
    if not record.display_name:
        record.display_name = record.model_id
    record.is_enabled = True

    # Ensure the provider exists and is enabled
    prov_result = await session.execute(
        select(Provider).where(Provider.name == record.provider_name)
    )
    provider = prov_result.scalars().first()
    if provider and not provider.is_enabled:
        provider.is_enabled = True
        session.add(provider)

    session.add(record)
    await session.commit()
    await session.refresh(record)
    return record


@router.delete("/{model_id}", status_code=204)
async def delete_model(model_id: str, session: AsyncSession = Depends(get_session)):
    result = await session.execute(
        select(ModelRecord).where(ModelRecord.id == model_id)
    )
    record = result.scalars().first()
    if not record:
        raise HTTPException(404, "Model not found")
    await session.delete(record)
    await session.commit()
    return Response(status_code=204)


@router.post("/sync/ollama")
async def sync_ollama_models(session: AsyncSession = Depends(get_session)):
    """Pull model list from the local Ollama instance and upsert into the DB."""
    try:
        async with httpx.AsyncClient(timeout=10.0) as client:
            resp = await client.get(f"{settings.ollama_base_url}/api/tags")
            resp.raise_for_status()
            data = resp.json()
    except Exception as e:
        raise HTTPException(502, f"Cannot reach Ollama: {e}")

    synced = []
    for m in data.get("models", []):
        name = m.get("name", "")
        if not name:
            continue
        model_id = f"ollama/{name}"
        result = await session.execute(
            select(ModelRecord).where(ModelRecord.model_id == model_id)
        )
        existing = result.scalars().first()
        if not existing:
            raw = m.get("details", {}).get("parameter_size")
            record = ModelRecord(
                model_id=model_id,
                display_name=name,
                provider_name="ollama",
                is_local=True,
                context_window=str(raw) if raw is not None else None,
            )
            session.add(record)
            synced.append(model_id)

    await session.commit()
    return {"synced": synced, "total_ollama": len(data.get("models", []))}
