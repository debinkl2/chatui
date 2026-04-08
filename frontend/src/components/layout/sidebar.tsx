"use client";

import { useEffect, useState, useCallback, useMemo, useRef } from "react";
import { Plus, Trash2, MessageSquare, Search, Edit2, CheckSquare, Square } from "lucide-react";
import { Button } from "@/components/ui/button";
import { ScrollArea } from "@/components/ui/scroll-area";
import { apiFetch } from "@/lib/api-client";
import type { Conversation } from "@/types";
import { cn } from "@/lib/utils";

function useDebounce<T>(value: T, delay: number): T {
  const [debounced, setDebounced] = useState(value);
  useEffect(() => {
    const timer = setTimeout(() => setDebounced(value), delay);
    return () => clearTimeout(timer);
  }, [value, delay]);
  return debounced;
}

interface SearchResult {
  id: string;
  title: string;
  model_id: string;
  created_at: string;
  updated_at: string;
  excerpt: string | null;
}

function HighlightedTitle({ title, query }: { title: string; query: string }) {
  if (!query) return <>{title}</>;
  const idx = title.toLowerCase().indexOf(query.toLowerCase());
  if (idx === -1) return <>{title}</>;
  return (
    <>
      {title.slice(0, idx)}
      <span className="rounded-sm bg-accent-foreground/15 px-0.5">{title.slice(idx, idx + query.length)}</span>
      {title.slice(idx + query.length)}
    </>
  );
}

interface SidebarProps {
  currentConversationId: string | null;
  onSelectConversation: (id: string | null) => void;
  onRefreshRef?: React.MutableRefObject<(() => void) | null>;
  onTitleUpdateRef?: React.MutableRefObject<((id: string, title: string) => void) | null>;
}

export function Sidebar({
  currentConversationId,
  onSelectConversation,
  onRefreshRef,
  onTitleUpdateRef,
}: SidebarProps) {
  const [conversations, setConversations] = useState<Conversation[]>([]);
  const [searchInput, setSearchInput] = useState("");
  const [searchResults, setSearchResults] = useState<SearchResult[] | null>(null);
  const [editingId, setEditingId] = useState<string | null>(null);
  const [editTitle, setEditTitle] = useState("");
  const [selectedIds, setSelectedIds] = useState<Set<string>>(new Set());
  const debouncedQuery = useDebounce(searchInput, 300);
  const editInputRef = useRef<HTMLInputElement>(null);

  const refresh = useCallback(async () => {
    try {
      const data = await apiFetch<Conversation[]>("/v1/conversations");
      setConversations(data);
    } catch {}
  }, []);

  useEffect(() => {
    refresh();
  }, [refresh]);

  // Expose refresh and title update to parent
  useEffect(() => {
    if (onRefreshRef) onRefreshRef.current = refresh;
    if (onTitleUpdateRef)
      onTitleUpdateRef.current = (id: string, title: string) => {
        setConversations((prev) =>
          prev.map((c) => (c.id === id ? { ...c, title } : c))
        );
      };
  }, [refresh, onRefreshRef, onTitleUpdateRef]);

  // Backend search when query changes
  useEffect(() => {
    const q = debouncedQuery.trim();
    if (!q) {
      setSearchResults(null);
      return;
    }
    (async () => {
      try {
        const data = await apiFetch<SearchResult[]>(
          `/v1/conversations/search?q=${encodeURIComponent(q)}`
        );
        setSearchResults(data);
      } catch {
        setSearchResults([]);
      }
    })();
  }, [debouncedQuery]);

  const displayList = searchResults !== null
    ? searchResults
    : conversations;

  const handleNew = async () => {
    setSearchInput("");
    setSearchResults(null);
    setSelectedIds(new Set());
    try {
      const convo = await apiFetch<Conversation>("/v1/conversations", {
        method: "POST",
        body: JSON.stringify({ title: "New Chat" }),
      });
      await refresh();
      onSelectConversation(convo.id);
    } catch (err) {
      console.error("Failed to create conversation:", err);
      onSelectConversation(null);
    }
  };

  const handleDelete = async (id: string) => {
    try {
      await apiFetch(`/v1/conversations/${id}`, { method: "DELETE" });
      setConversations((prev) => prev.filter((c) => c.id !== id));
      if (searchResults) {
        setSearchResults((prev) => prev ? prev.filter((c) => c.id !== id) : null);
      }
      if (currentConversationId === id) onSelectConversation(null);
    } catch {}
  };

  const handleBulkDelete = async () => {
    const ids = Array.from(selectedIds);
    for (const id of ids) {
      try {
        await apiFetch(`/v1/conversations/${id}`, { method: "DELETE" });
      } catch {}
    }
    setConversations((prev) => prev.filter((c) => !selectedIds.has(c.id)));
    if (searchResults) {
      setSearchResults((prev) => prev ? prev.filter((c) => !selectedIds.has(c.id)) : null);
    }
    if (currentConversationId && selectedIds.has(currentConversationId)) {
      onSelectConversation(null);
    }
    setSelectedIds(new Set());
  };

  const toggleSelect = (id: string) => {
    setSelectedIds((prev) => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });
  };

  const toggleSelectAll = () => {
    if (selectedIds.size === displayList.length) {
      setSelectedIds(new Set());
    } else {
      setSelectedIds(new Set(displayList.map((c) => c.id)));
    }
  };

  const startRename = (id: string, currentTitle: string) => {
    setEditingId(id);
    setEditTitle(currentTitle);
    setTimeout(() => editInputRef.current?.focus(), 50);
  };

  const saveRename = async () => {
    if (!editingId || !editTitle.trim()) {
      setEditingId(null);
      return;
    }
    try {
      await apiFetch(`/v1/conversations/${editingId}`, {
        method: "PATCH",
        body: JSON.stringify({ title: editTitle.trim() }),
      });
      setConversations((prev) =>
        prev.map((c) => (c.id === editingId ? { ...c, title: editTitle.trim() } : c))
      );
    } catch {}
    setEditingId(null);
  };

  const cancelRename = () => {
    setEditingId(null);
  };

  return (
    <aside className="flex w-64 flex-col border-r bg-muted/30">
      <div className="flex items-center justify-between p-3">
        <span className="text-sm font-medium text-muted-foreground">Chats</span>
        <Button variant="ghost" size="icon" onClick={handleNew}>
          <Plus className="h-4 w-4" />
        </Button>
      </div>

      {selectedIds.size > 0 && (
        <div className="flex items-center gap-2 px-3 pb-2">
          <button
            type="button"
            onClick={toggleSelectAll}
            className="text-muted-foreground hover:text-foreground"
          >
            {selectedIds.size === displayList.length ? (
              <CheckSquare className="h-3.5 w-3.5" />
            ) : (
              <Square className="h-3.5 w-3.5" />
            )}
          </button>
          <Button
            variant="destructive"
            size="sm"
            className="h-7 text-xs flex-1"
            onClick={handleBulkDelete}
          >
            Delete selected ({selectedIds.size})
          </Button>
        </div>
      )}

      <div className="px-3 pb-2">
        <div className="relative">
          <Search className="absolute left-2.5 top-1/2 h-3.5 w-3.5 -translate-y-1/2 text-muted-foreground" />
          <input
            type="text"
            placeholder="Search chats…"
            value={searchInput}
            onChange={(e) => setSearchInput(e.target.value)}
            className="h-8 w-full rounded-md border border-input bg-background pl-8 pr-3 text-xs placeholder:text-muted-foreground focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-ring"
          />
        </div>
      </div>
      <ScrollArea className="flex-1 px-2">
        <div className="space-y-1 pb-4">
          {displayList.map((c) => (
            <div
              key={c.id}
              className={cn(
                "group flex cursor-pointer items-center gap-1.5 rounded-lg px-2 py-2 text-sm transition-colors hover:bg-accent",
                currentConversationId === c.id && "bg-accent",
              )}
              onClick={() => {
                if (editingId !== c.id) onSelectConversation(c.id);
              }}
            >
              <button
                type="button"
                className="shrink-0 opacity-0 group-hover:opacity-100 text-muted-foreground hover:text-foreground"
                onClick={(e) => {
                  e.stopPropagation();
                  toggleSelect(c.id);
                }}
              >
                {selectedIds.has(c.id) ? (
                  <CheckSquare className="h-3.5 w-3.5" />
                ) : (
                  <Square className="h-3.5 w-3.5" />
                )}
              </button>
              <MessageSquare className="h-4 w-4 shrink-0 text-muted-foreground" />
              <div className="min-w-0 flex-1">
                {editingId === c.id ? (
                  <input
                    ref={editInputRef}
                    type="text"
                    value={editTitle}
                    onChange={(e) => setEditTitle(e.target.value)}
                    onKeyDown={(e) => {
                      if (e.key === "Enter") saveRename();
                      if (e.key === "Escape") cancelRename();
                    }}
                    onBlur={saveRename}
                    onClick={(e) => e.stopPropagation()}
                    className="w-full rounded border border-input bg-background px-1 py-0.5 text-xs focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-ring"
                  />
                ) : (
                  <>
                    <span className="block truncate">
                      <HighlightedTitle title={c.title} query={debouncedQuery.trim()} />
                    </span>
                    {"excerpt" in c && (c as SearchResult).excerpt && (
                      <span className="block truncate text-[10px] text-muted-foreground">
                        {(c as SearchResult).excerpt}
                      </span>
                    )}
                  </>
                )}
              </div>
              <div className="flex shrink-0 items-center gap-0.5 opacity-0 group-hover:opacity-100">
                <button
                  type="button"
                  className="rounded p-0.5 text-muted-foreground hover:text-foreground"
                  onClick={(e) => {
                    e.stopPropagation();
                    startRename(c.id, c.title);
                  }}
                >
                  <Edit2 className="h-3.5 w-3.5" />
                </button>
                <button
                  type="button"
                  className="rounded p-0.5 text-muted-foreground hover:text-destructive"
                  onClick={(e) => {
                    e.stopPropagation();
                    handleDelete(c.id);
                  }}
                >
                  <Trash2 className="h-3.5 w-3.5" />
                </button>
              </div>
            </div>
          ))}
          {conversations.length === 0 && !searchResults && (
            <p className="px-3 py-8 text-center text-xs text-muted-foreground">
              No conversations yet
            </p>
          )}
          {displayList.length === 0 && searchResults !== null && (
            <p className="px-3 py-8 text-center text-xs text-muted-foreground">
              No conversations found
            </p>
          )}
        </div>
      </ScrollArea>
    </aside>
  );
}
