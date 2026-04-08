"use client";

import { useState, useCallback, useEffect } from "react";
import type { ChatSettings } from "@/types";

const STORAGE_KEY = "chatui-settings";

const defaults: ChatSettings = {
  temperature: 0.7,
  maxTokens: 2048,
  topP: 1.0,
  systemPrompt: "",
};

export function useChatSettings() {
  const [settings, setSettingsState] = useState<ChatSettings>(defaults);

  useEffect(() => {
    try {
      const raw = localStorage.getItem(STORAGE_KEY);
      if (raw) setSettingsState({ ...defaults, ...JSON.parse(raw) });
    } catch {}
  }, []);

  const setSettings = useCallback((update: Partial<ChatSettings>) => {
    setSettingsState((prev) => {
      const next = { ...prev, ...update };
      localStorage.setItem(STORAGE_KEY, JSON.stringify(next));
      return next;
    });
  }, []);

  return { settings, setSettings };
}
