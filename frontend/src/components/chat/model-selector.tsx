"use client";

import { RefreshCw } from "lucide-react";
import { Button } from "@/components/ui/button";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { Badge } from "@/components/ui/badge";
import type { ModelOption } from "@/types";

interface ModelSelectorProps {
  models: ModelOption[];
  value: string;
  onChange: (value: string) => void;
  onSync?: () => void;
  loading?: boolean;
  className?: string;
}

export function ModelSelector({
  models,
  value,
  onChange,
  onSync,
  loading,
  className,
}: ModelSelectorProps) {
  return (
    <div className={`flex items-center gap-2 ${className ?? ""}`}>
      <Select value={value} onValueChange={onChange}>
        <SelectTrigger className="w-[220px]">
          <SelectValue placeholder="Select a model" />
        </SelectTrigger>
        <SelectContent>
          {models.map((m) => (
            <SelectItem key={m.model_id} value={m.model_id}>
              <div className="flex items-center gap-2">
                <span>{m.display_name}</span>
                <Badge
                  variant={m.is_local ? "secondary" : "outline"}
                  className="text-[10px]"
                >
                  {m.provider_name}
                </Badge>
              </div>
            </SelectItem>
          ))}
          {models.length === 0 && (
            <div className="px-2 py-4 text-center text-xs text-muted-foreground">
              No models — click sync
            </div>
          )}
        </SelectContent>
      </Select>
      {onSync && (
        <Button
          variant="ghost"
          size="icon"
          onClick={onSync}
          disabled={loading}
          title="Sync Ollama models"
        >
          <RefreshCw className={`h-4 w-4 ${loading ? "animate-spin" : ""}`} />
        </Button>
      )}
    </div>
  );
}
