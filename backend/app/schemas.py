from __future__ import annotations

from typing import Any, Optional, Union

from pydantic import BaseModel


# ── Chat Completions ─────────────────────────────────────────
class ChatMessage(BaseModel):
    role: str
    content: str
    name: Optional[str] = None
    tool_call_id: Optional[str] = None
    tool_calls: Optional[list[dict[str, Any]]] = None


class ChatRequest(BaseModel):
    model: str
    messages: list[ChatMessage]
    temperature: float = 0.7
    max_tokens: int = 2048
    top_p: float = 1.0
    stream: bool = True
    mode: Optional[str] = None
    system_prompt: Optional[str] = None
    conversation_id: Optional[str] = None
    # Optional RAG context injected by frontend
    context_documents: Optional[list[str]] = None


class ArenaRequest(BaseModel):
    model_a: str
    model_b: str
    messages: list[ChatMessage]
    temperature: float = 0.7
    max_tokens: int = 2048
    top_p: float = 1.0
    mode: Optional[str] = None
    system_prompt: Optional[str] = None
    conversation_id: Optional[str] = None
    context_documents: Optional[list[str]] = None


# ── Provider CRUD ────────────────────────────────────────────
class ProviderCreate(BaseModel):
    name: str
    api_key: str = ""
    base_url: str = ""
    is_enabled: bool = True


class ProviderUpdate(BaseModel):
    api_key: Optional[str] = None
    base_url: Optional[str] = None
    is_enabled: Optional[bool] = None


class ProviderRead(BaseModel):
    id: str
    name: str
    base_url: str
    is_enabled: bool
    has_api_key: bool  # Never expose actual key


# ── Model CRUD ───────────────────────────────────────────────
class ModelCreate(BaseModel):
    model_id: str
    display_name: str = ""
    provider_name: str
    is_local: bool = False
    context_window: Optional[Union[int, str]] = None


class ModelRead(BaseModel):
    id: str
    model_id: str
    display_name: str
    provider_name: str
    is_local: bool
    is_enabled: bool
    context_window: Optional[Union[int, str]] = None


# ── Conversation / Messages ─────────────────────────────────
class ConversationCreate(BaseModel):
    title: str = "New Chat"
    model_id: str = ""


class ConversationUpdate(BaseModel):
    title: Optional[str] = None


class ConversationRead(BaseModel):
    id: str
    title: str
    model_id: str
    created_at: str
    updated_at: str


class MessageRead(BaseModel):
    id: str
    conversation_id: str
    role: str
    content: str
    model_id: Optional[str]
    tokens_prompt: int
    tokens_completion: int
    tps: float
    ttft_ms: float
    created_at: str


# ── MCP ──────────────────────────────────────────────────────
class McpServerCreate(BaseModel):
    name: str
    url: str


class McpServerRead(BaseModel):
    id: str
    name: str
    url: str
    is_enabled: bool
    tools_json: str
    last_synced: Optional[str]


# ── File Upload ──────────────────────────────────────────────
class FileUploadResponse(BaseModel):
    filename: str
    content: str
    char_count: int


# ── Metrics (returned alongside arena streams) ──────────────
class StreamMetrics(BaseModel):
    model_id: str
    tps: float
    ttft_ms: float
    tokens_generated: int
    elapsed_seconds: float
