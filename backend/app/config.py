from __future__ import annotations

from pydantic_settings import BaseSettings, SettingsConfigDict


class Settings(BaseSettings):
    model_config = SettingsConfigDict(env_file=".env", extra="ignore")

    # Database
    database_url: str = "sqlite:///./data/chatui.db"

    # Ollama
    ollama_base_url: str = "http://host.docker.internal:11434"

    # Optional bootstrap API keys (prefer DB storage via Settings UI)
    openai_api_key: str = ""
    anthropic_api_key: str = ""
    gemini_api_key: str = ""

    # MCP
    mcp_server_urls: str = ""  # comma-separated

    # CORS
    cors_origins: str = "http://localhost:3000,http://127.0.0.1:3000"


settings = Settings()
