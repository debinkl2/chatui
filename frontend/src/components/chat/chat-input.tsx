"use client";

import { useRef, useEffect, useCallback, type KeyboardEvent } from "react";
import { Send, Square } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Textarea } from "@/components/ui/textarea";
import { FileUpload } from "@/components/chat/file-upload";
import type { UploadedFile } from "@/types";

interface ChatInputProps {
  value: string;
  onChange: (value: string) => void;
  onSend: () => void;
  onStop?: () => void;
  isStreaming?: boolean;
  disabled?: boolean;
  files: UploadedFile[];
  onFilesChange: (files: UploadedFile[]) => void;
  placeholder?: string;
}

export function ChatInput({
  value,
  onChange,
  onSend,
  onStop,
  isStreaming,
  disabled,
  files,
  onFilesChange,
  placeholder = "Type a message…",
}: ChatInputProps) {
  const textareaRef = useRef<HTMLTextAreaElement>(null);

  const autoResize = useCallback(() => {
    const el = textareaRef.current;
    if (!el) return;
    el.style.height = "auto";
    el.style.height = `${Math.min(el.scrollHeight, 200)}px`;
  }, []);

  useEffect(() => {
    autoResize();
  }, [value, autoResize]);

  const handleKeyDown = (e: KeyboardEvent<HTMLTextAreaElement>) => {
    if (e.key === "Enter" && !e.shiftKey) {
      e.preventDefault();
      if (value.trim() && !isStreaming) onSend();
    }
  };

  return (
    <div className="mx-auto w-full max-w-3xl">
      <div className="relative rounded-2xl border bg-background shadow-sm">
        <Textarea
          ref={textareaRef}
          value={value}
          onChange={(e) => onChange(e.target.value)}
          onKeyDown={handleKeyDown}
          placeholder={placeholder}
          disabled={disabled && !isStreaming}
          rows={2}
          className="min-h-[56px] max-h-[200px] resize-none border-0 pr-24 shadow-none focus-visible:ring-0 overflow-y-auto"
        />
        <div className="absolute bottom-2 right-2 flex items-center gap-1">
          <FileUpload files={files} onFilesChange={onFilesChange} />
          {isStreaming ? (
            <Button
              size="icon"
              variant="destructive"
              onClick={onStop}
              className="h-8 w-8 rounded-xl"
            >
              <Square className="h-4 w-4 fill-current" />
            </Button>
          ) : (
            <Button
              size="icon"
              onClick={onSend}
              disabled={disabled || !value.trim()}
              className="h-8 w-8 rounded-xl"
            >
              <Send className="h-4 w-4" />
            </Button>
          )}
        </div>
      </div>
      <p className="mt-1.5 text-center text-[10px] text-muted-foreground">
        AI can make mistakes. Verify important information.
      </p>
    </div>
  );
}
