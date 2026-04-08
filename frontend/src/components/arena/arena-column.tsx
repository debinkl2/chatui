"use client";

import { useRef, useEffect, useCallback } from "react";
import { MessageBubble } from "@/components/chat/message-bubble";
import { Badge } from "@/components/ui/badge";
import type { StreamMetrics } from "@/types";

interface ArenaMessage {
  id: string;
  role: "user" | "assistant";
  content: string;
}

interface ArenaColumnProps {
  modelId: string;
  messages: ArenaMessage[];
  isStreaming: boolean;
  metrics: StreamMetrics | null;
}

export function ArenaColumn({
  modelId,
  messages,
  isStreaming,
  metrics,
}: ArenaColumnProps) {
  const bottomRef = useRef<HTMLDivElement>(null);
  const scrollRef = useRef<HTMLDivElement>(null);

  const isNearBottom = useCallback(() => {
    const el = scrollRef.current;
    if (!el) return true;
    return el.scrollHeight - el.scrollTop - el.clientHeight < 100;
  }, []);

  useEffect(() => {
    if (isNearBottom()) {
      bottomRef.current?.scrollIntoView({ behavior: "smooth" });
    }
  }, [messages, isNearBottom]);

  return (
    <div className="flex min-h-0 min-w-0 flex-1 flex-col overflow-hidden">
      {/* Column header */}
      <div className="flex shrink-0 items-center justify-between border-b px-3 py-2">
        <Badge variant="outline" className="font-mono text-xs">
          {modelId || "Select model"}
        </Badge>
        {metrics && (
          <div className="metrics-fade-in flex gap-2 text-[10px] text-muted-foreground">
            <span>{metrics.tps.toFixed(1)} tok/s</span>
            <span>{metrics.ttft_ms.toFixed(0)}ms TTFT</span>
            <span>{metrics.tokens_generated} tokens</span>
          </div>
        )}
      </div>

      {/* Messages */}
      <div ref={scrollRef} className="min-h-0 min-w-0 w-full flex-1 overflow-y-auto overflow-x-hidden px-3">
        <div className="py-2">
          {messages.filter(Boolean).map((msg) => (
            <MessageBubble
              key={msg.id}
              role={msg.role}
              content={msg.content ?? ""}
              modelId={msg.role === "assistant" ? modelId : undefined}
              isStreaming={
                isStreaming &&
                msg.role === "assistant" &&
                msg.id === messages[messages.length - 1]?.id
              }
            />
          ))}
          <div ref={bottomRef} />
        </div>
      </div>
    </div>
  );
}
