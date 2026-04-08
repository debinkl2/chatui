"""Provider CRUD — /v1/providers

API keys are stored here and NEVER exposed to the frontend.
"""
from __future__ import annotations

import datetime

from fastapi import APIRouter, Depends, HTTPException
from fastapi.responses import Response
from sqlalchemy.ext.asyncio import AsyncSession
from sqlmodel import select

from app.database import get_session
from app.models import Provider, ModelRecord
from app.schemas import ProviderCreate, ProviderRead, ProviderUpdate

router = APIRouter(prefix="/v1/providers", tags=["providers"])


@router.get("", response_model=list[ProviderRead])
async def list_providers(session: AsyncSession = Depends(get_session)):
    result = await session.execute(select(Provider))
    providers = result.scalars().all()
    return [
        ProviderRead(
            id=p.id,
            name=p.name,
            base_url=p.base_url,
            is_enabled=p.is_enabled,
            has_api_key=bool(p.api_key),
        )
        for p in providers
    ]


@router.post("", response_model=ProviderRead, status_code=201)
async def create_provider(body: ProviderCreate, session: AsyncSession = Depends(get_session)):
    provider = Provider(**body.model_dump())
    provider.is_enabled = True
    session.add(provider)
    await session.commit()
    await session.refresh(provider)
    return ProviderRead(
        id=provider.id,
        name=provider.name,
        base_url=provider.base_url,
        is_enabled=provider.is_enabled,
        has_api_key=bool(provider.api_key),
    )


@router.patch("/{provider_id}", response_model=ProviderRead)
async def update_provider(
    provider_id: str,
    body: ProviderUpdate,
    session: AsyncSession = Depends(get_session),
):
    result = await session.execute(
        select(Provider).where(Provider.id == provider_id)
    )
    provider = result.scalars().first()
    if not provider:
        raise HTTPException(404, "Provider not found")

    if body.api_key is not None:
        provider.api_key = body.api_key
    if body.base_url is not None:
        provider.base_url = body.base_url
    if body.is_enabled is not None:
        provider.is_enabled = body.is_enabled
    provider.updated_at = datetime.datetime.now(datetime.timezone.utc)

    session.add(provider)
    await session.commit()
    await session.refresh(provider)
    return ProviderRead(
        id=provider.id,
        name=provider.name,
        base_url=provider.base_url,
        is_enabled=provider.is_enabled,
        has_api_key=bool(provider.api_key),
    )


@router.delete("/{provider_id}", status_code=204)
async def delete_provider(provider_id: str, session: AsyncSession = Depends(get_session)):
    result = await session.execute(
        select(Provider).where(Provider.id == provider_id)
    )
    provider = result.scalars().first()
    if not provider:
        raise HTTPException(404, "Provider not found")
    # Cascade-delete all models for this provider
    models_result = await session.execute(
        select(ModelRecord).where(ModelRecord.provider_name == provider.name)
    )
    for model in models_result.scalars().all():
        await session.delete(model)
    await session.delete(provider)
    await session.commit()
    return Response(status_code=204)
