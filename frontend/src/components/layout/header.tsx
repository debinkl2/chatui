"use client";

import { Columns2, MessageSquare, Settings } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";

interface HeaderProps {
  arenaMode: boolean;
  onToggleArena: () => void;
  onOpenSettings: () => void;
}

export function Header({ arenaMode, onToggleArena, onOpenSettings }: HeaderProps) {
  return (
    <header className="z-40 flex h-14 shrink-0 items-center justify-between border-b bg-background/95 px-4 backdrop-blur supports-[backdrop-filter]:bg-background/60">
      <div className="flex items-center gap-3">
        <div className="flex items-center gap-2">
          <MessageSquare className="h-5 w-5 text-primary" />
          <span className="text-lg font-semibold tracking-tight">ChatUI</span>
        </div>
        <Badge variant="secondary" className="text-[10px]">
          Gateway
        </Badge>
      </div>

      <div className="flex items-center gap-1">
        <Button
          variant={arenaMode ? "default" : "ghost"}
          size="sm"
          onClick={onToggleArena}
          className="gap-2"
        >
          <Columns2 className="h-4 w-4" />
          <span className="hidden sm:inline">Arena</span>
        </Button>
        <Button variant="ghost" size="icon" onClick={onOpenSettings}>
          <Settings className="h-4 w-4" />
        </Button>
      </div>
    </header>
  );
}
