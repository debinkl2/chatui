"use client";

import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";

interface SystemPromptProps {
  value: string;
  onChange: (value: string) => void;
}

export function SystemPrompt({ value, onChange }: SystemPromptProps) {
  return (
    <div className="space-y-2">
      <Label className="text-xs">System Prompt</Label>
      <Textarea
        value={value}
        onChange={(e) => onChange(e.target.value)}
        placeholder="You are a helpful assistant…"
        rows={4}
        className="resize-none text-sm"
      />
    </div>
  );
}
