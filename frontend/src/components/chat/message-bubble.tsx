"use client";

import { useState, useCallback } from "react";
import ReactMarkdown from "react-markdown";
import remarkGfm from "remark-gfm";
import { Bot, User, Clipboard, Check, Copy } from "lucide-react";
import { Avatar, AvatarFallback } from "@/components/ui/avatar";
import { cn } from "@/lib/utils";

interface MessageBubbleProps {
  role: "user" | "assistant" | "system" | "tool";
  content: string;
  modelId?: string;
  tps?: number;
  ttft_ms?: number;
  isStreaming?: boolean;
}

function CodeBlock({ className, children }: { className?: string; children?: React.ReactNode }) {
  const [copied, setCopied] = useState(false);
  const raw = String(children).replace(/\n$/, "");
  const lang = className?.replace(/^language-/, "") || "";

  const handleCopy = useCallback(() => {
    navigator.clipboard.writeText(raw);
    setCopied(true);
    setTimeout(() => setCopied(false), 2000);
  }, [raw]);

  return (
    <div className="my-3 max-w-full overflow-hidden rounded-lg border border-border" style={{ background: 'hsl(var(--code-block))' }}>
      <div className="flex items-center justify-between border-b border-border px-3 py-1.5" style={{ background: 'hsl(var(--code-header))' }}>
        <span className="text-[11px] font-medium text-muted-foreground">
          {lang || "code"}
        </span>
        <button
          type="button"
          onClick={handleCopy}
          className="inline-flex items-center gap-1 rounded px-1.5 py-0.5 text-[11px] text-muted-foreground transition-colors hover:text-foreground"
        >
          {copied ? (
            <Check className="h-3.5 w-3.5" />
          ) : (
            <Clipboard className="h-3.5 w-3.5" />
          )}
          {copied ? "Copied" : "Copy"}
        </button>
      </div>
      <pre className="w-full max-w-full overflow-x-auto p-3 text-sm leading-relaxed">
        <code className={cn("font-mono text-foreground", className)}>{raw}</code>
      </pre>
    </div>
  );
}

function CopyMessageButton({ text }: { text: string }) {
  const [copied, setCopied] = useState(false);
  const handleCopy = useCallback(() => {
    navigator.clipboard.writeText(text);
    setCopied(true);
    setTimeout(() => setCopied(false), 2000);
  }, [text]);
  return (
    <button
      type="button"
      onClick={handleCopy}
      className="rounded p-1 text-muted-foreground opacity-0 transition-opacity hover:text-foreground group-hover:opacity-100"
      title="Copy message"
    >
      {copied ? <Check className="h-3.5 w-3.5" /> : <Copy className="h-3.5 w-3.5" />}
    </button>
  );
}

export function MessageBubble({
  role,
  content,
  modelId,
  tps,
  ttft_ms,
  isStreaming,
}: MessageBubbleProps) {
  const isUser = role === "user";
  const isWaiting = isStreaming && !content;
  const isActivelyStreaming = isStreaming && !!content;

  return (
    <div
      className={cn(
        "group flex min-w-0 gap-3 py-4",
        isUser ? "flex-row-reverse" : "flex-row",
      )}
    >
      <Avatar className="mt-0.5 shrink-0">
        <AvatarFallback
          className={cn(
            isUser
              ? "bg-primary text-primary-foreground"
              : "bg-muted text-muted-foreground",
          )}
        >
          {isUser ? <User className="h-4 w-4" /> : <Bot className="h-4 w-4" />}
        </AvatarFallback>
      </Avatar>

      <div
        className={cn(
          "min-w-0 flex max-w-[80%] flex-col gap-1",
          isUser ? "items-end" : "items-start",
        )}
      >
        {modelId && !isUser && (
          <span className="text-[10px] text-muted-foreground">{modelId}</span>
        )}
        <div
          className={cn(
            "min-w-0 max-w-full overflow-hidden rounded-2xl px-4 py-2.5 text-sm leading-relaxed",
            isUser
              ? "bg-primary text-primary-foreground"
              : "bg-muted text-foreground",
          )}
        >
          {isUser ? (
            <p className="whitespace-pre-wrap" style={{ overflowWrap: 'anywhere' }}>{content}</p>
          ) : isWaiting ? (
            <div className="flex items-center gap-1.5 py-1">
              <span className="typing-dot" />
              <span className="typing-dot" />
              <span className="typing-dot" />
            </div>
          ) : (
            <div className="prose prose-sm max-w-none overflow-hidden" style={{ overflowWrap: 'anywhere', wordBreak: 'break-word' }}>
              <ReactMarkdown
                remarkPlugins={[remarkGfm]}
                components={{
                  code({ className, children, ...props }) {
                    const isInline = !className;
                    if (isInline) {
                      return (
                        <code
                          className="rounded bg-muted-foreground/15 px-1 py-0.5 font-mono text-[13px]"
                          {...props}
                        >
                          {children}
                        </code>
                      );
                    }
                    return <CodeBlock className={className}>{children}</CodeBlock>;
                  },
                  pre({ children }) {
                    return <>{children}</>;
                  },
                }}
              >
                {content}
              </ReactMarkdown>
              {isActivelyStreaming && <span className="streaming-cursor" />}
            </div>
          )}
        </div>

        {/* Copy + Metrics row */}
        {content && !isWaiting && (
          <div className="flex items-center gap-1">
            <CopyMessageButton text={content} />
          </div>
        )}
        {!isUser && !isStreaming && (tps || ttft_ms) && (
          <div className="metrics-fade-in flex gap-3 text-[10px] text-muted-foreground">
            {tps ? <span>{tps.toFixed(1)} tok/s</span> : null}
            {ttft_ms ? <span>{ttft_ms.toFixed(0)}ms TTFT</span> : null}
          </div>
        )}
      </div>
    </div>
  );
}
