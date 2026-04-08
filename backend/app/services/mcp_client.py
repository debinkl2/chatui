"""MCP (Model Context Protocol) client.

Discovers tool schemas from remote MCP servers, and executes tool calls
via JSON-RPC 2.0 over HTTP.
"""
from __future__ import annotations

import json
import logging
from typing import Any

import httpx
from sqlalchemy.ext.asyncio import AsyncSession
from sqlmodel import select

from app.models import McpServer

logger = logging.getLogger(__name__)

_HTTP_TIMEOUT = 30.0


async def discover_tools(server_url: str) -> list[dict[str, Any]]:
    """Fetch the tool list from an MCP server's tools/list endpoint."""
    async with httpx.AsyncClient(timeout=_HTTP_TIMEOUT) as client:
        payload = {
            "jsonrpc": "2.0",
            "id": 1,
            "method": "tools/list",
            "params": {},
        }
        resp = await client.post(server_url, json=payload)
        resp.raise_for_status()
        data = resp.json()

    result = data.get("result", {})
    tools = result.get("tools", [])
    return tools


async def execute_tool(
    server_url: str,
    tool_name: str,
    arguments: dict[str, Any],
) -> Any:
    """Execute a tool call on a remote MCP server."""
    async with httpx.AsyncClient(timeout=_HTTP_TIMEOUT) as client:
        payload = {
            "jsonrpc": "2.0",
            "id": 1,
            "method": "tools/call",
            "params": {
                "name": tool_name,
                "arguments": arguments,
            },
        }
        resp = await client.post(server_url, json=payload)
        resp.raise_for_status()
        data = resp.json()

    if "error" in data:
        raise RuntimeError(f"MCP tool error: {data['error']}")
    return data.get("result", {})


def mcp_tools_to_openai_format(tools: list[dict[str, Any]]) -> list[dict[str, Any]]:
    """Convert MCP tool schemas to OpenAI function-calling format."""
    openai_tools = []
    for tool in tools:
        openai_tools.append({
            "type": "function",
            "function": {
                "name": tool.get("name", ""),
                "description": tool.get("description", ""),
                "parameters": tool.get("inputSchema", {"type": "object", "properties": {}}),
            },
        })
    return openai_tools


async def sync_server_tools(server: McpServer, session: AsyncSession) -> list[dict[str, Any]]:
    """Discover and cache tools for a given MCP server."""
    import datetime

    try:
        tools = await discover_tools(server.url)
        server.tools_json = json.dumps(tools)
        server.last_synced = datetime.datetime.now(datetime.timezone.utc)
        session.add(server)
        await session.commit()
        logger.info(f"Synced {len(tools)} tools from MCP server: {server.name}")
        return tools
    except Exception as e:
        logger.error(f"Failed to sync MCP server {server.name}: {e}")
        return json.loads(server.tools_json) if server.tools_json else []


async def get_all_mcp_tools(session: AsyncSession) -> tuple[list[dict[str, Any]], dict[str, str]]:
    """Load all enabled MCP tools and return (openai_tools, tool_name→server_url map)."""
    result = await session.execute(
        select(McpServer).where(McpServer.is_enabled == True)  # noqa: E712
    )
    servers = result.scalars().all()

    all_tools: list[dict[str, Any]] = []
    tool_server_map: dict[str, str] = {}

    for server in servers:
        tools = json.loads(server.tools_json) if server.tools_json else []
        if not tools:
            tools = await sync_server_tools(server, session)
        for t in tools:
            tool_server_map[t.get("name", "")] = server.url
        all_tools.extend(tools)

    return mcp_tools_to_openai_format(all_tools), tool_server_map


async def handle_tool_calls(
    tool_calls: list[dict[str, Any]],
    tool_server_map: dict[str, str],
) -> list[dict[str, str]]:
    """Execute a batch of tool calls returned by the LLM.

    Returns a list of message dicts with role=tool for the next completion round.
    """
    results = []
    for tc in tool_calls:
        fn = tc.get("function", {})
        name = fn.get("name", "")
        raw_args = fn.get("arguments", "{}")
        arguments = json.loads(raw_args) if isinstance(raw_args, str) else raw_args
        call_id = tc.get("id", "")

        server_url = tool_server_map.get(name)
        if not server_url:
            results.append({
                "role": "tool",
                "tool_call_id": call_id,
                "content": json.dumps({"error": f"Unknown tool: {name}"}),
            })
            continue

        try:
            result = await execute_tool(server_url, name, arguments)
            results.append({
                "role": "tool",
                "tool_call_id": call_id,
                "content": json.dumps(result) if not isinstance(result, str) else result,
            })
        except Exception as e:
            results.append({
                "role": "tool",
                "tool_call_id": call_id,
                "content": json.dumps({"error": str(e)}),
            })

    return results
