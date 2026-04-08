"use client";

import { useState, useCallback, useRef, useEffect } from "react";
import { ArenaColumn } from "@/components/arena/arena-column";
import { ChatInput } from "@/components/chat/chat-input";
import { ModelSelector } from "@/components/chat/model-selector";
import { Badge } from "@/components/ui/badge";
import { ModeSelector } from "@/components/chat/mode-selector";
import type { ChatMode } from "@/components/chat/mode-selector";
import { Separator } from "@/components/ui/separator";
import type { ChatSettings, ModelOption, StreamMetrics, UploadedFile } from "@/types";

interface ArenaMessage {
  id: string;
  role: "user" | "assistant";
  content: string;
}

interface ArenaViewProps {
  models: ModelOption[];
  onSyncOllama: () => void;
  modelsLoading: boolean;
  settings: ChatSettings;
  mode: ChatMode;
  onModeChange: (mode: ChatMode) => void;
}

export function ArenaView({
  models,
  onSyncOllama,
  modelsLoading,
  settings,
  mode,
  onModeChange,
}: ArenaViewProps) {
  const [modelA, setModelA] = useState("");
  const [modelB, setModelB] = useState("");
  const [messagesA, setMessagesA] = useState<ArenaMessage[]>([]);
  const [messagesB, setMessagesB] = useState<ArenaMessage[]>([]);
  const [metricsA, setMetricsA] = useState<StreamMetrics | null>(null);
  const [metricsB, setMetricsB] = useState<StreamMetrics | null>(null);
  const [input, setInput] = useState("");
  const [files, setFiles] = useState<UploadedFile[]>([]);
  const [isStreamingA, setIsStreamingA] = useState(false);
  const [isStreamingB, setIsStreamingB] = useState(false);

  const isStreaming = isStreamingA || isStreamingB;

  // Track full conversation history for multi-turn context
  const conversationHistory = useRef<{ role: string; content: string }[]>([]);
  const abortControllerRef = useRef<AbortController | null>(null);

  const sameModel = modelA && modelB && modelA === modelB;
  const modelsForB = models.filter((m) => m.model_id !== modelA);
  const modelsForA = models.filter((m) => m.model_id !== modelB);

  const handleStop = useCallback(() => {
    abortControllerRef.current?.abort();
    abortControllerRef.current = null;
  }, []);

  const handleSend = useCallback(async () => {
    if (!input.trim() || !modelA || !modelB || isStreaming) return;

    const userText = input.trim();
    const userId = crypto.randomUUID();

    const userMsg: ArenaMessage = { id: userId, role: "user", content: userText };
    const assistantA: ArenaMessage = {
      id: crypto.randomUUID(),
      role: "assistant",
      content: "",
    };
    const assistantB: ArenaMessage = {
      id: crypto.randomUUID(),
      role: "assistant",
      content: "",
    };

    setMessagesA((prev) => [...prev, userMsg, assistantA]);
    setMessagesB((prev) => [...prev, { ...userMsg }, assistantB]);
    conversationHistory.current.push({ role: "user", content: userText });
    setInput("");
    setIsStreamingA(true);
    setIsStreamingB(true);
    setMetricsA(null);
    setMetricsB(null);

    // Trim history to max 100 messages
    let trimmedHistory = conversationHistory.current;
    if (trimmedHistory.length > 100) {
      trimmedHistory = trimmedHistory.slice(-100);
    }

    const controller = new AbortController();
    abortControllerRef.current = controller;
    let assistantAContent = "";

    try {
      const res = await fetch("/api/backend/v1/arena/completions", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          model_a: modelA,
          model_b: modelB,
          messages: trimmedHistory,
          temperature: settings.temperature,
          max_tokens: settings.maxTokens,
          top_p: settings.topP,
          mode: mode,
          system_prompt: settings.systemPrompt || undefined,
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
            const trimmed = line.trim();
            if (!trimmed) continue;
            try {
              const event = JSON.parse(trimmed);

              if (event.type === "chunk") {
                const content =
                  event.data?.choices?.[0]?.delta?.content || "";
                if (!content) continue;

                if (event.model === modelA) {
                  assistantAContent += content;
                  setMessagesA((prev) => {
                    const updated = [...prev];
                    const last = updated[updated.length - 1];
                    if (last?.role === "assistant") last.content += content;
                    return updated;
                  });
                } else if (event.model === modelB) {
                  setMessagesB((prev) => {
                    const updated = [...prev];
                    const last = updated[updated.length - 1];
                    if (last?.role === "assistant") last.content += content;
                    return updated;
                  });
                }
              }

              if (event.type === "metrics") {
                const m = event.data as StreamMetrics;
                if (event.model === modelA) {
                  setMetricsA(m);
                  setIsStreamingA(false);
                } else if (event.model === modelB) {
                  setMetricsB(m);
                  setIsStreamingB(false);
                }
              }
            } catch {}
          }
        }
      }
    } catch (err) {
      if (err instanceof DOMException && err.name === "AbortError") {
        // User clicked Stop — keep partial text, append notice
        setMessagesA((prev) => {
          const updated = [...prev];
          const last = updated[updated.length - 1];
          if (last?.role === "assistant") {
            last.content = last.content.trim()
              ? last.content + "\n\n*Generation stopped.*"
              : "*Generation stopped.*";
          }
          return updated;
        });
        setMessagesB((prev) => {
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
        const errMsg = err instanceof Error ? err.message : "Request failed";
        setMessagesA((prev) => {
          const updated = [...prev];
          const last = updated[updated.length - 1];
          if (last?.role === "assistant" && !last.content)
            last.content = `Error: ${errMsg}`;
          return updated;
        });
        setMessagesB((prev) => {
          const updated = [...prev];
          const last = updated[updated.length - 1];
          if (last?.role === "assistant" && !last.content)
            last.content = `Error: ${errMsg}`;
          return updated;
        });
      }
    } finally {
      abortControllerRef.current = null;
      setIsStreamingA(false);
      setIsStreamingB(false);
      setFiles([]);
      // Save model A's response for conversation context
      if (assistantAContent) {
        conversationHistory.current.push({ role: "assistant", content: assistantAContent });
      }
    }
  }, [input, modelA, modelB, isStreaming, settings, files, mode]);

  return (
    <div className="flex min-h-0 flex-1 flex-col">
      {/* Model selectors */}
      <div className="flex shrink-0 flex-wrap items-center justify-center gap-3 border-b px-4 py-2 sm:gap-6">
        <ModelSelector
          models={modelsForA}
          value={modelA}
          onChange={setModelA}
          onSync={onSyncOllama}
          loading={modelsLoading}
        />
        <span className="text-xs font-medium text-muted-foreground">VS</span>
        <ModelSelector
          models={modelsForB}
          value={modelB}
          onChange={setModelB}
        />
        <ModeSelector value={mode} onChange={onModeChange} />
      </div>
      {sameModel && (
        <div className="flex shrink-0 justify-center py-1.5">
          <Badge variant="destructive" className="text-[10px]">
            Both sides have the same model — select a different one
          </Badge>
        </div>
      )}

      {/* Split columns */}
      <div className="flex min-h-0 w-full flex-1 flex-col overflow-x-hidden overflow-y-hidden md:flex-row">
        <ArenaColumn
          modelId={modelA}
          messages={messagesA}
          isStreaming={isStreamingA}
          metrics={metricsA}
        />
        <Separator orientation="vertical" className="shrink-0" />
        <ArenaColumn
          modelId={modelB}
          messages={messagesB}
          isStreaming={isStreamingB}
          metrics={metricsB}
        />
      </div>

      {/* Shared input */}
      <div className="shrink-0 border-t px-4 py-3">
        <ChatInput
          value={input}
          onChange={setInput}
          onSend={handleSend}
          onStop={handleStop}
          isStreaming={isStreaming}
          disabled={!modelA || !modelB || !!sameModel}
          files={files}
          onFilesChange={setFiles}
          placeholder="Send to both models…"
        />
      </div>
    </div>
  );
}
