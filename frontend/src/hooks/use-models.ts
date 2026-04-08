"use client";

import { useState, useEffect, useCallback } from "react";
import { apiFetch } from "@/lib/api-client";
import type { ModelOption } from "@/types";

export function useModels() {
  const [models, setModels] = useState<ModelOption[]>([]);
  const [loading, setLoading] = useState(true);

  const refresh = useCallback(async () => {
    setLoading(true);
    try {
      const data = await apiFetch<ModelOption[]>("/v1/models");
      setModels(data);
    } catch (err) {
      console.error("Failed to fetch models:", err);
    } finally {
      setLoading(false);
    }
  }, []);

  const syncOllama = useCallback(async () => {
    try {
      await apiFetch("/v1/models/sync/ollama", { method: "POST" });
      await refresh();
    } catch (err) {
      console.error("Ollama sync failed:", err);
    }
  }, [refresh]);

  useEffect(() => {
    refresh();
  }, [refresh]);

  return { models, loading, refresh, syncOllama };
}
