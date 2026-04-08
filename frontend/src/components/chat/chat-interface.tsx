"use client";

import { useState, useRef, useEffect, useCallback } from "react";
import { MessageBubble } from "@/components/chat/message-bubble";
import { ChatInput } from "@/components/chat/chat-input";
import { ModelSelector } from "@/components/chat/model-selector";
import { ModeSelector } from "@/components/chat/mode-selector";
import type { ChatMode } from "@/components/chat/mode-selector";
import { apiFetch } from "@/lib/api-client";
import type { ChatSettings, ModelOption, UploadedFile, Conversation } from "@/types";
import { Sparkles } from "lucide-react";

interface Message {
  id: string;
  role: "user" | "assistant";
  content: string;
  modelId?: string;
  tps?: number;
  ttft_ms?: number;
}

interface ChatInterfaceProps {
  models: ModelOption[];
  selectedModel: string;
  onModelChange: (model: string) => void;
  onSyncOllama: () => void;
  modelsLoading: boolean;
  settings: ChatSettings;
  mode: ChatMode;
  onModeChange: (mode: ChatMode) => void;
  conversationId: string | null;
  onConversationChange: (id: string | null) => void;
  onConversationTitleUpdate?: (id: string, title: string) => void;
}

export function ChatInterface({
  models,
  selectedModel,
  onModelChange,
  onSyncOllama,
  modelsLoading,
  settings,
  mode,
  onModeChange,
  conversationId,
  onConversationChange,
  onConversationTitleUpdate,
}: ChatInterfaceProps) {
  const [messages, setMessages] = useState<Message[]>([]);
  const [input, setInput] = useState("");
  const [files, setFiles] = useState<UploadedFile[]>([]);
  const [isStreaming, setIsStreaming] = useState(false);
  const bottomRef = useRef<HTMLDivElement>(null);
  const scrollContainerRef = useRef<HTMLDivElement>(null);
  const activeConvoRef = useRef<string | null>(conversationId);
  const isFirstExchangeRef = useRef(false);
  const userJustSentRef = useRef(false);
  const abortControllerRef = useRef<AbortController | null>(null);

  const isNearBottom = useCallback(() => {
    const el = scrollContainerRef.current;
    if (!el) return true;
    return el.scrollHeight - el.scrollTop - el.clientHeight < 100;
  }, []);

  const scrollToBottom = useCallback((instant?: boolean) => {
    bottomRef.current?.scrollIntoView({ behavior: instant ? "instant" : "smooth" });
  }, []);

  useEffect(() => {
    if (userJustSentRef.current || isNearBottom()) {
      scrollToBottom();
      userJustSentRef.current = false;
    }
  }, [messages, scrollToBottom, isNearBottom]);

  // Load messages when conversationId changes
  useEffect(() => {
    activeConvoRef.current = conversationId;
    if (!conversationId) {
      setMessages([]);
      return;
    }
    // Skip loading if we just created this conversation — messages are already
    // managed locally by handleSend and the streaming loop.
    if (isFirstExchangeRef.current) return;
    (async () => {
      try {
        const data = await apiFetch<
          { id: string; role: string; content: string; model_id?: string; tps?: number; ttft_ms?: number }[]
        >(`/v1/conversations/${conversationId}/messages`);
        setMessages(
          data.map((m) => ({
            id: m.id,
            role: m.role as "user" | "assistant",
            content: m.content,
            modelId: m.model_id || undefined,
            tps: m.tps,
            ttft_ms: m.ttft_ms,
          }))
        );
        // Instant scroll to bottom when switching conversations
        requestAnimationFrame(() => scrollToBottom(true));
      } catch (err) {
        console.error("Failed to load messages:", err);
        setMessages([]);
      }
    })();
  }, [conversationId, scrollToBottom]);

  const handleStop = useCallback(() => {
    abortControllerRef.current?.abort();
    abortControllerRef.current = null;
  }, []);

  const handleSend = useCallback(async () => {
    if (!input.trim() || !selectedModel || isStreaming) return;

    // Auto-create conversation if none exists
    let convoId = activeConvoRef.current;
    if (!convoId) {
      try {
        const convo = await apiFetch<Conversation>("/v1/conversations", {
          method: "POST",
          body: JSON.stringify({
            title: "New Chat",
            model_id: selectedModel,
          }),
        });
        convoId = convo.id;
        activeConvoRef.current = convoId;
        isFirstExchangeRef.current = true;
        onConversationChange(convoId);
      } catch (err) {
        console.error("Failed to create conversation:", err);
      }
    }

    const userMsg: Message = {
      id: crypto.randomUUID(),
      role: "user",
      content: input.trim(),
    };
    const firstUserText = userMsg.content;

    const assistantMsg: Message = {
      id: crypto.randomUUID(),
      role: "assistant",
      content: "",
      modelId: selectedModel,
    };

    setMessages((prev) => [...prev, userMsg, assistantMsg]);
    setInput("");
    setIsStreaming(true);
    userJustSentRef.current = true;

    // Build full conversation history and trim to max 100 messages
    let allMessages = [...messages, userMsg].map((m) => ({
      role: m.role,
      content: m.content,
    }));
    if (allMessages.length > 100) {
      allMessages = allMessages.slice(-100);
    }

    const controller = new AbortController();
    abortControllerRef.current = controller;

    try {
      const res = await fetch("/api/backend/v1/chat/completions", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          model: selectedModel,
          messages: allMessages,
          temperature: settings.temperature,
          max_tokens: settings.maxTokens,
          top_p: settings.topP,
          mode: mode,
          system_prompt: settings.systemPrompt || undefined,
          stream: true,
          conversation_id: convoId || undefined,
          context_documents: files.length
            ? files.map((f) => f.content)
            : undefined,
        }),
        signal: controller.signal,
      });

      if (!res.ok) throw new Error(`HTTP ${res.status}`);

      const reader = res.body?.getReader();
      const decoder = new TextDecoder();
      let buffer = "";

      if (reader) {
        while (true) {
          const { done, value } = await reader.read();
          if (done) break;

          buffer += decoder.decode(value, { stream: true });
          const lines = buffer.split("\n");
          buffer = lines.pop() || "";

          for (const line of lines) {
            const trimmed = line.replace(/^data:\s*/, "").trim();
            if (!trimmed || trimmed === "[DONE]") continue;
            try {
              const parsed = JSON.parse(trimmed);
              if (parsed.content) {
                setMessages((prev) => {
                  const updated = [...prev];
                  const last = updated[updated.length - 1];
                  if (last?.role === "assistant") {
                    last.content += parsed.content;
                  }
                  return updated;
                });
              }
              if (parsed.metrics) {
                setMessages((prev) => {
                  const updated = [...prev];
                  const last = updated[updated.length - 1];
                  if (last?.role === "assistant") {
                    last.tps = parsed.metrics.tps;
                    last.ttft_ms = parsed.metrics.ttft_ms;
                  }
                  return updated;
                });
              }
            } catch {}
          }
        }
      }
      // Check for empty response after successful stream
      setMessages((prev) => {
        const updated = [...prev];
        const last = updated[updated.length - 1];
        if (last?.role === "assistant" && !last.content.trim()) {
          last.content = "Model did not respond. Please try again.";
        }
        return updated;
      });
    } catch (err) {
      if (err instanceof DOMException && err.name === "AbortError") {
        // User clicked Stop — keep partial text, append notice
        setMessages((prev) => {
          const updated = [...prev];
          const last = updated[updated.length - 1];
          if (last?.role === "assistant") {
            last.content = last.content.trim()
              ? last.content + "\n\n*Generation stopped.*"
              : "*Generation stopped.*";
          }
          return updated;
        });
      } else {
        setMessages((prev) => {
          const updated = [...prev];
          const last = updated[updated.length - 1];
          if (last?.role === "assistant") {
            last.content = `Error: ${err instanceof Error ? err.message : "Request failed"}`;
          }
          return updated;
        });
      }
    } finally {
      abortControllerRef.current = null;
      setIsStreaming(false);
      setFiles([]);
      // Auto-generate title after first exchange
      if (isFirstExchangeRef.current && convoId) {
        isFirstExchangeRef.current = false;
        let title = firstUserText;
        if (title.length > 40) {
          title = title.slice(0, 40);
          const lastSpace = title.lastIndexOf(" ");
          if (lastSpace > 10) title = title.slice(0, lastSpace);
          title += "...";
        }
        try {
          await apiFetch(`/v1/conversations/${convoId}`, {
            method: "PATCH",
            body: JSON.stringify({ title }),
          });
          onConversationTitleUpdate?.(convoId, title);
        } catch (err) {
          console.error("Failed to update conversation title:", err);
        }
      }
    }
  }, [input, selectedModel, isStreaming, messages, settings, files, mode, onConversationChange, onConversationTitleUpdate]);

  return (
    <div className="flex min-h-0 flex-1 flex-col">
      {/* Model selector bar */}
      <div className="flex shrink-0 items-center justify-center gap-4 border-b px-4 py-2">
        <ModelSelector
          models={models}
          value={selectedModel}
          onChange={onModelChange}
          onSync={onSyncOllama}
          loading={modelsLoading}
        />
        <ModeSelector value={mode} onChange={onModeChange} />
      </div>

      {/* Messages */}
      <div ref={scrollContainerRef} className="min-h-0 flex-1 overflow-y-auto px-4">
        <div className="mx-auto max-w-3xl">
          {messages.length === 0 && (
            <div className="flex flex-col items-center justify-center py-24 text-center">
              <div className="mb-4 rounded-2xl bg-muted p-4">
                <Sparkles className="h-8 w-8 text-muted-foreground" />
              </div>
              <h2 className="text-xl font-semibold">How can I help you?</h2>
              <p className="mt-1 text-sm text-muted-foreground">
                Select a model and start chatting.
              </p>
            </div>
          )}
          {messages.filter(Boolean).map((msg) => (
            <MessageBubble
              key={msg.id}
              role={msg.role}
              content={msg.content ?? ""}
              modelId={msg.modelId}
              tps={msg.tps}
              ttft_ms={msg.ttft_ms}
              isStreaming={
                isStreaming &&
                msg.id === messages[messages.length - 1]?.id &&
                msg.role === "assistant"
              }
            />
          ))}
          <div ref={bottomRef} />
        </div>
      </div>

      {/* Input */}
      <div className="shrink-0 border-t px-4 py-3">
        <ChatInput
          value={input}
          onChange={setInput}
          onSend={handleSend}
          onStop={handleStop}
          isStreaming={isStreaming}
          disabled={!selectedModel}
          files={files}
          onFilesChange={setFiles}
        />
      </div>
    </div>
  );
}
