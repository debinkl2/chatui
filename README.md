# ChatUI — Local-to-Cloud AI Gateway

A premium, polished AI chat interface that routes seamlessly between local Ollama models and cloud APIs (OpenAI, Anthropic, Gemini) via a unified gateway. Runs entirely via Docker.

![Stack](https://img.shields.io/badge/Next.js-15-black) ![Stack](https://img.shields.io/badge/FastAPI-0.115-009688) ![Stack](https://img.shields.io/badge/LiteLLM-1.55-blue) ![Stack](https://img.shields.io/badge/SQLite-3-003B57)

---

## Features

- **Universal Chat** — Polished streaming UI with model selector, markdown rendering, and code highlighting
- **Comparison Arena** — Responsive split-screen mode to compare two models side-by-side with a shared input
- **Stop Generation** — Cancel any in-flight response with a single click (AbortController-based)
- **Conversation History** — Follow-up questions include prior context for coherent multi-turn conversations
- **Streaming Feedback** — Three visual states: typing dots → blinking cursor → metrics fade-in
- **Smart Concurrency** — Two local models run sequentially (VRAM-safe); cloud models run concurrently
- **Sidebar Management** — Search conversations, inline rename, single delete, and multi-select bulk delete
- **Copy Messages** — One-click copy button on every assistant response
- **Settings Panel** — Temperature, max tokens, top-p sliders and custom system prompts
- **RAG Attachments** — Upload `.txt`, `.pdf`, `.md`, `.csv`, `.json` files as context
- **MCP Integration** — Discover and execute tools from remote MCP servers via JSON-RPC 2.0
- **Metrics** — Tokens/second (TPS) and Time to First Token (TTFT) displayed per response
- **Theming** — Light theme with font family selector (Inter, System, Mono, Serif)
- **Secure** — API keys stored in SQLite, never exposed to the frontend

---

## Quick Start (Zero-Build Install)

You can run this entire application locally without downloading the source code or installing Node/Python. Just ensure [Docker Desktop](https://docs.docker.com/get-docker/) is running.

**1. Download the production config:**
` ` `bash
curl -O https://raw.githubusercontent.com/debojyotidas/ChatUI/main/docker-compose.prod.yml
` ` `

**2. Boot the app:**
` ` `bash
docker compose -f docker-compose.prod.yml up -d
` ` `

*That's it! Open [http://localhost:3000](http://localhost:3000) to start chatting.*

---

### For Developers (Build from source)
If you want to modify the code:
1. Clone the repo: `git clone https://github.com/debojyotidas/ChatUI.git`
2. Build and launch: `docker compose up -d --build`

### 4. Add models

**Ollama models** — If Ollama is running on your host, click the sync (↻) button next to the model selector. This calls `POST /v1/models/sync/ollama` and auto-registers all pulled models.

**Cloud models** — Use the Settings panel (⚙) to configure API keys, then add models via the API:

```bash
Provider name: OpenRouter
Base URL: https://openrouter.ai/api/v1
API Key: (Paste your actual Anthropic API key here)
Model name: google/gemma-4-31b-it

Provider name: Anthropic
Base URL: https://api.anthropic.com/v1
API Key: (Paste your actual Anthropic API key here)
Model name: claude-sonnet-4-6
Version: 2023-06-01

Provider name: Nvdia
Base URL: https://integrate.api.nvidia.com/v1
API Key: (Paste your actual Anthropic API key here)
Model name: mistralai/mistral-small-4-119b-2603

```


---

## Architecture

```
┌─────────────┐    rewrite proxy     ┌─────────────────┐     LiteLLM      ┌──────────┐
│  Next.js 15  │ ──────────────────► │   FastAPI        │ ───────────────► │  OpenAI  │
│  (port 3000) │   /api/backend/*    │   (port 8000)    │                  │ Anthropic│
│              │                     │                  │ ───────────────► │  Gemini  │
│  React 19    │                     │  SQLite DB       │                  └──────────┘
│  shadcn/ui   │                     │  LiteLLM Router  │
│  Tailwind    │                     │  MCP Client      │ ───────────────► ┌──────────┐
└─────────────┘                     │  RAG Parser      │                  │  Ollama  │
                                    └─────────────────┘                  │  (11434) │
                                                                         └──────────┘
```

### Ollama Connectivity

> **macOS users** — Ollama must be started with network access enabled:
> ```bash
> OLLAMA_HOST=0.0.0.0 OLLAMA_ORIGINS="*" ollama serve
> ```
> `launchctl setenv` does **not** apply to an already-running Ollama process.

| Platform | How it works |
|---|---|
| **macOS / Windows** | Docker Desktop maps `host.docker.internal` → host. Set in `docker-compose.yml` via `extra_hosts`. |
| **Linux** | Option A: Use `extra_hosts: host.docker.internal:host-gateway` (Docker 20.10+). Option B: Add `network_mode: host` to the backend service. |

---

## Project Structure

```
ChatUI/
├── docker-compose.yml          # Full stack orchestration
├── .env.example                # Environment template
├── Makefile                    # make up / down / logs / restart / clean
│
├── backend/
│   ├── Dockerfile
│   ├── requirements.txt
│   └── app/
│       ├── main.py             # FastAPI app + lifespan + seed
│       ├── config.py           # Pydantic settings
│       ├── database.py         # Async SQLAlchemy + SQLite
│       ├── models.py           # ORM: Provider, Model, Conversation, Message, McpServer
│       ├── schemas.py          # Request/response schemas
│       ├── routers/            # API endpoints
│       │   ├── chat.py         # POST /v1/chat/completions (SSE + MCP tool loop)
│       │   ├── arena.py        # POST /v1/arena/completions (NDJSON stream)
│       │   ├── models.py       # CRUD + Ollama sync
│       │   ├── providers.py    # API key management
│       │   ├── conversations.py
│       │   └── mcp.py          # MCP servers + file upload
│       └── services/
│           ├── litellm_router.py  # Universal LLM routing
│           ├── concurrency.py     # Arena: sequential vs concurrent
│           ├── mcp_client.py      # JSON-RPC 2.0 tool discovery + execution
│           ├── metrics.py         # TPS + TTFT tracking
│           └── rag.py             # PDF + text file parsing
│
└── frontend/
    ├── Dockerfile              # Multi-stage Node 20 Alpine
    ├── package.json
    ├── next.config.js          # Standalone + rewrite proxy
    └── src/
        ├── app/
        │   ├── layout.tsx      # Root layout + ThemeProvider
        │   ├── page.tsx        # Main page (Chat / Arena toggle)
        │   ├── globals.css     # Tailwind + CSS variable theming
        │   └── api/chat/route.ts  # SSE passthrough
        ├── components/
        │   ├── chat/           # ChatInterface, MessageBubble, ChatInput, ModelSelector, FileUpload
        │   ├── arena/          # ArenaView, ArenaColumn
        │   ├── settings/       # SettingsDrawer, ParameterSlider, SystemPrompt
        │   ├── layout/         # Header, Sidebar, Footer
        │   ├── theme/          # FontSelector, ThemeProvider
        │   └── ui/             # 13 shadcn/ui primitives
        ├── hooks/              # useModels, useChatSettings
        ├── lib/                # utils, api-client
        └── types/              # TypeScript interfaces
```

---

## API Reference

| Method | Endpoint | Description |
|---|---|---|
| `POST` | `/v1/chat/completions` | Streaming chat (SSE) with MCP tool loop |
| `POST` | `/v1/arena/completions` | Arena dual-model stream (NDJSON) |
| `GET` | `/v1/models` | List enabled models |
| `POST` | `/v1/models` | Register a model |
| `DELETE` | `/v1/models/:id` | Delete a model |
| `POST` | `/v1/models/sync/ollama` | Auto-discover Ollama models |
| `GET` | `/v1/providers` | List providers (keys redacted) |
| `PATCH` | `/v1/providers/:id` | Update API key / toggle |
| `GET` | `/v1/conversations` | List conversations |
| `GET` | `/v1/conversations/search` | Search conversations by title |
| `POST` | `/v1/conversations` | Create conversation |
| `PATCH` | `/v1/conversations/:id` | Rename conversation |
| `DELETE` | `/v1/conversations/:id` | Delete conversation |
| `GET` | `/v1/conversations/:id/messages` | Get messages |
| `POST` | `/v1/upload` | Upload file for RAG |
| `GET/POST/DELETE` | `/v1/mcp/servers` | MCP server management |
| `GET` | `/health` | Health check |

---

## Development

Run outside Docker for hot-reload:

```bash
# Backend
cd backend
pip install -r requirements.txt
uvicorn app.main:app --reload --port 8000

# Frontend (separate terminal)
cd frontend
npm install
npm run dev
```

Set `BACKEND_INTERNAL_URL=http://localhost:8000` in `frontend/.env.local`.

---

## License

MIT
