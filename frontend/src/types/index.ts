// ── Models ───────────────────────────────────────────────────
export interface ModelOption {
  id: string;
  model_id: string;
  display_name: string;
  provider_name: string;
  is_local: boolean;
  is_enabled: boolean;
  context_window: number | string | null;
}

// ── Provider ────────────────────────────────────────────────
export interface ProviderInfo {
  id: string;
  name: string;
  base_url: string;
  is_enabled: boolean;
  has_api_key: boolean;
}

// ── Conversation ────────────────────────────────────────────
export interface Conversation {
  id: string;
  title: string;
  model_id: string;
  created_at: string;
  updated_at: string;
}

// ── Messages ────────────────────────────────────────────────
export interface ChatMessageData {
  id: string;
  conversation_id: string;
  role: "system" | "user" | "assistant" | "tool";
  content: string;
  model_id?: string;
  tokens_prompt: number;
  tokens_completion: number;
  tps: number;
  ttft_ms: number;
  created_at: string;
}

// ── Chat Settings ───────────────────────────────────────────
export interface ChatSettings {
  temperature: number;
  maxTokens: number;
  topP: number;
  systemPrompt: string;
}

// ── Arena ───────────────────────────────────────────────────
export interface ArenaEvent {
  type: "chunk" | "metrics" | "done" | "error";
  model: string;
  data?: Record<string, unknown>;
}

export interface StreamMetrics {
  model_id: string;
  tps: number;
  ttft_ms: number;
  tokens_generated: number;
  elapsed_seconds: number;
}

// ── MCP ─────────────────────────────────────────────────────
export interface McpServer {
  id: string;
  name: string;
  url: string;
  is_enabled: boolean;
  tools_json: string;
  last_synced: string | null;
}

// ── File Upload ─────────────────────────────────────────────
export interface UploadedFile {
  filename: string;
  content: string;
  char_count: number;
}
