from __future__ import annotations

import datetime
import uuid
from typing import Optional

from sqlmodel import Field, SQLModel


# ── Utilities ────────────────────────────────────────────────
def _uuid() -> str:
    return str(uuid.uuid4())


def _now() -> datetime.datetime:
    return datetime.datetime.now(datetime.timezone.utc)


# ── Providers (stores API keys securely – never sent to frontend) ─
class Provider(SQLModel, table=True):
    __tablename__ = "providers"

    id: str = Field(default_factory=_uuid, primary_key=True)
    name: str = Field(index=True, unique=True)  # e.g. "openai", "anthropic", "gemini", "ollama"
    api_key: str = ""  # encrypted-at-rest in a real deployment
    base_url: str = ""  # e.g. http://host.docker.internal:11434
    is_enabled: bool = True
    created_at: datetime.datetime = Field(default_factory=_now)
    updated_at: datetime.datetime = Field(default_factory=_now)


# ── Model Registry ──────────────────────────────────────────
class ModelRecord(SQLModel, table=True):
    __tablename__ = "models"

    id: str = Field(default_factory=_uuid, primary_key=True)
    model_id: str = Field(index=True, unique=True)  # e.g. "gpt-4o", "ollama/llama3"
    display_name: str = ""
    provider_name: str = Field(index=True)  # FK-like ref to Provider.name
    is_local: bool = False  # True for Ollama models
    is_enabled: bool = True
    context_window: Optional[str] = None
    created_at: datetime.datetime = Field(default_factory=_now)


# ── Conversations ────────────────────────────────────────────
class Conversation(SQLModel, table=True):
    __tablename__ = "conversations"

    id: str = Field(default_factory=_uuid, primary_key=True)
    title: str = "New Chat"
    model_id: str = ""
    created_at: datetime.datetime = Field(default_factory=_now)
    updated_at: datetime.datetime = Field(default_factory=_now)


# ── Messages ─────────────────────────────────────────────────
class Message(SQLModel, table=True):
    __tablename__ = "messages"

    id: str = Field(default_factory=_uuid, primary_key=True)
    conversation_id: str = Field(index=True)
    role: str  # "system" | "user" | "assistant" | "tool"
    content: str = ""
    model_id: Optional[str] = None
    tokens_prompt: int = 0
    tokens_completion: int = 0
    tps: float = 0.0
    ttft_ms: float = 0.0
    created_at: datetime.datetime = Field(default_factory=_now)


# ── MCP Server Registry ─────────────────────────────────────
class McpServer(SQLModel, table=True):
    __tablename__ = "mcp_servers"

    id: str = Field(default_factory=_uuid, primary_key=True)
    name: str = ""
    url: str = Field(unique=True)
    is_enabled: bool = True
    tools_json: str = "[]"  # cached JSON array of tool schemas
    last_synced: Optional[datetime.datetime] = None
    created_at: datetime.datetime = Field(default_factory=_now)
