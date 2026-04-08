"""ChatUI — FastAPI application entry point."""
from __future__ import annotations

import logging
from contextlib import asynccontextmanager

from fastapi import FastAPI
from fastapi.middleware.cors import CORSMiddleware

from app.config import settings
from app.database import init_db
from app.routers import arena, chat, conversations, mcp, models, providers

logging.basicConfig(
    level=logging.INFO,
    format="%(asctime)s %(levelname)-8s %(name)s — %(message)s",
)
logger = logging.getLogger(__name__)


@asynccontextmanager
async def lifespan(app: FastAPI):
    logger.info("Initialising database …")
    await init_db()
    await _seed_default_providers()
    logger.info("ChatUI backend ready.")
    yield
    logger.info("Shutting down …")


app = FastAPI(
    title="ChatUI Gateway",
    version="1.0.0",
    lifespan=lifespan,
)

# CORS
origins = [o.strip() for o in settings.cors_origins.split(",") if o.strip()]
app.add_middleware(
    CORSMiddleware,
    allow_origins=origins,
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)

# Routers
app.include_router(chat.router)
app.include_router(arena.router)
app.include_router(models.router)
app.include_router(providers.router)
app.include_router(conversations.router)
app.include_router(mcp.router)


@app.get("/health")
async def health():
    return {"status": "ok"}


# ── Seed helpers ─────────────────────────────────────────────
async def _seed_default_providers():
    """Ensure the ollama provider exists in the DB on first boot."""
    from sqlmodel import select
    from app.database import async_session
    from app.models import Provider

    defaults = [
        {"name": "ollama", "base_url": settings.ollama_base_url},
    ]

    async with async_session() as session:
        for d in defaults:
            result = await session.execute(
                select(Provider).where(Provider.name == d["name"])
            )
            if not result.scalars().first():
                session.add(Provider(**d))
        await session.commit()
