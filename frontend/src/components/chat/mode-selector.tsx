"use client";

import { Zap, Brain } from "lucide-react";

export type ChatMode = "auto" | "fast" | "thinking";

interface ModeSelectorProps {
  value: ChatMode;
  onChange: (mode: ChatMode) => void;
}

const modes: { id: ChatMode; label: string; icon?: React.ReactNode }[] = [
  { id: "auto", label: "Auto" },
  { id: "fast", label: "Fast", icon: <Zap className="h-3 w-3" /> },
  { id: "thinking", label: "Thinking", icon: <Brain className="h-3 w-3" /> },
];

export function ModeSelector({ value, onChange }: ModeSelectorProps) {
  return (
    <div className="flex flex-col items-start gap-0.5">
      <div className="flex items-center rounded-full border border-border bg-muted/40 p-0.5">
        {modes.map((m) => {
          const active = value === m.id;
          return (
            <button
              key={m.id}
              type="button"
              onClick={() => onChange(m.id)}
              className={`inline-flex items-center gap-1 rounded-full px-2.5 py-0.5 text-xs font-medium transition-colors ${
                active
                  ? "bg-primary text-primary-foreground shadow-sm"
                  : "text-muted-foreground hover:text-foreground"
              }`}
            >
              {m.icon}
              {m.label}
            </button>
          );
        })}
      </div>
      {value !== "auto" && (
        <span className="pl-1 text-[10px] text-muted-foreground">
          Overrides manual slider settings
        </span>
      )}
    </div>
  );
}
