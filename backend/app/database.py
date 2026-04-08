from __future__ import annotations

from sqlalchemy.ext.asyncio import AsyncSession, create_async_engine
from sqlalchemy.orm import sessionmaker
from sqlmodel import SQLModel

from app.config import settings

# Convert sqlite:/// to sqlite+aiosqlite:///
_url = settings.database_url.replace("sqlite:///", "sqlite+aiosqlite:///", 1)

engine = create_async_engine(_url, echo=False, future=True)

async_session = sessionmaker(engine, class_=AsyncSession, expire_on_commit=False)


async def init_db() -> None:
    async with engine.begin() as conn:
        await conn.run_sync(SQLModel.metadata.create_all)


async def get_session():
    async with async_session() as session:
        yield session
