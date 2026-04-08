"""MCP server management & file upload — /v1/mcp, /v1/upload"""
from __future__ import annotations

import json

from fastapi import APIRouter, Depends, HTTPException, UploadFile, File
from sqlalchemy.ext.asyncio import AsyncSession
from sqlmodel import select

from app.database import get_session
from app.models import McpServer
from app.schemas import FileUploadResponse, McpServerCreate, McpServerRead
from app.services.mcp_client import sync_server_tools
from app.services.rag import parse_upload

router = APIRouter(tags=["mcp", "upload"])


# ── MCP Server CRUD ──────────────────────────────────────────
@router.get("/v1/mcp/servers", response_model=list[McpServerRead])
async def list_mcp_servers(session: AsyncSession = Depends(get_session)):
    result = await session.execute(select(McpServer))
    servers = result.scalars().all()
    return [
        McpServerRead(
            id=s.id,
            name=s.name,
            url=s.url,
            is_enabled=s.is_enabled,
            tools_json=s.tools_json,
            last_synced=s.last_synced.isoformat() if s.last_synced else None,
        )
        for s in servers
    ]


@router.post("/v1/mcp/servers", response_model=McpServerRead, status_code=201)
async def add_mcp_server(body: McpServerCreate, session: AsyncSession = Depends(get_session)):
    server = McpServer(name=body.name, url=body.url)
    session.add(server)
    await session.commit()
    await session.refresh(server)
    # Immediately discover tools
    await sync_server_tools(server, session)
    await session.refresh(server)
    return McpServerRead(
        id=server.id,
        name=server.name,
        url=server.url,
        is_enabled=server.is_enabled,
        tools_json=server.tools_json,
        last_synced=server.last_synced.isoformat() if server.last_synced else None,
    )


@router.post("/v1/mcp/servers/{server_id}/sync")
async def sync_mcp_server(server_id: str, session: AsyncSession = Depends(get_session)):
    result = await session.execute(
        select(McpServer).where(McpServer.id == server_id)
    )
    server = result.scalars().first()
    if not server:
        raise HTTPException(404, "MCP server not found")
    tools = await sync_server_tools(server, session)
    return {"tools_count": len(tools)}


@router.delete("/v1/mcp/servers/{server_id}")
async def delete_mcp_server(server_id: str, session: AsyncSession = Depends(get_session)):
    result = await session.execute(
        select(McpServer).where(McpServer.id == server_id)
    )
    server = result.scalars().first()
    if not server:
        raise HTTPException(404, "MCP server not found")
    await session.delete(server)
    await session.commit()
    return {"status": "deleted"}


# ── File Upload (RAG) ────────────────────────────────────────
@router.post("/v1/upload", response_model=FileUploadResponse)
async def upload_file(file: UploadFile = File(...)):
    if not file.filename:
        raise HTTPException(400, "No filename provided")

    # Limit file size to 10 MB
    content = await file.read()
    if len(content) > 10 * 1024 * 1024:
        raise HTTPException(413, "File too large (max 10 MB)")

    allowed_extensions = (".txt", ".md", ".csv", ".json", ".pdf")
    if not any(file.filename.lower().endswith(ext) for ext in allowed_extensions):
        raise HTTPException(
            415,
            f"Unsupported file type. Allowed: {', '.join(allowed_extensions)}",
        )

    text = parse_upload(content, file.filename)
    return FileUploadResponse(
        filename=file.filename,
        content=text,
        char_count=len(text),
    )
