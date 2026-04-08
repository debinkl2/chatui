"use client";

import { useState, useRef, useCallback } from "react";
import { Header } from "@/components/layout/header";
import { Sidebar } from "@/components/layout/sidebar";
import { Footer } from "@/components/layout/footer";
import { ChatInterface } from "@/components/chat/chat-interface";
import { ArenaView } from "@/components/arena/arena-view";
import { SettingsDrawer } from "@/components/settings/settings-drawer";
import { useModels } from "@/hooks/use-models";
import { useChatSettings } from "@/hooks/use-chat-settings";
import type { ChatMode } from "@/components/chat/mode-selector";

const MODE_PRESETS: Record<string, { temperature: number; maxTokens: number }> = {
  fast: { temperature: 0.3, maxTokens: 512 },
  thinking: { temperature: 0.5, maxTokens: 8192 },
};

export default function Home() {
  const { models, loading: modelsLoading, syncOllama } = useModels();
  const { settings, setSettings } = useChatSettings();

  const [arenaMode, setArenaMode] = useState(false);
  const [settingsOpen, setSettingsOpen] = useState(false);
  const [selectedModel, setSelectedModel] = useState("");
  const [currentConversationId, setCurrentConversationId] = useState<
    string | null
  >(null);
  const sidebarRefreshRef = useRef<(() => void) | null>(null);
  const sidebarTitleUpdateRef = useRef<((id: string, title: string) => void) | null>(null);

  const [mode, setModeState] = useState<ChatMode>("auto");
  const manualSettingsRef = useRef({ temperature: settings.temperature, maxTokens: settings.maxTokens });

  const handleModeChange = useCallback((newMode: ChatMode) => {
    if (newMode === "auto") {
      // Restore manual slider values
      setSettings({
        temperature: manualSettingsRef.current.temperature,
        maxTokens: manualSettingsRef.current.maxTokens,
      });
    } else {
      // Save current manual values before overwriting
      if (mode === "auto") {
        manualSettingsRef.current = { temperature: settings.temperature, maxTokens: settings.maxTokens };
      }
      const preset = MODE_PRESETS[newMode];
      setSettings({ temperature: preset.temperature, maxTokens: preset.maxTokens });
    }
    setModeState(newMode);
  }, [mode, settings.temperature, settings.maxTokens, setSettings]);

  const handleSettingsChange = useCallback((update: Partial<typeof settings>) => {
    setSettings(update);
    // If user manually drags a slider while in a non-auto mode, revert to auto
    if (mode !== "auto") {
      const preset = MODE_PRESETS[mode];
      const newTemp = update.temperature ?? settings.temperature;
      const newMax = update.maxTokens ?? settings.maxTokens;
      if (newTemp !== preset.temperature || newMax !== preset.maxTokens) {
        setModeState("auto");
        manualSettingsRef.current = {
          temperature: update.temperature ?? settings.temperature,
          maxTokens: update.maxTokens ?? settings.maxTokens,
        };
      }
    } else {
      // Update manual ref when in auto mode
      if (update.temperature !== undefined) manualSettingsRef.current.temperature = update.temperature;
      if (update.maxTokens !== undefined) manualSettingsRef.current.maxTokens = update.maxTokens;
    }
  }, [mode, settings.temperature, settings.maxTokens, setSettings]);

  return (
    <div className="flex h-screen flex-col overflow-hidden">
      <Header
        arenaMode={arenaMode}
        onToggleArena={() => setArenaMode(!arenaMode)}
        onOpenSettings={() => setSettingsOpen(true)}
      />

      <div className="flex flex-1 overflow-hidden">
        <Sidebar
          currentConversationId={currentConversationId}
          onSelectConversation={setCurrentConversationId}
          onRefreshRef={sidebarRefreshRef}
          onTitleUpdateRef={sidebarTitleUpdateRef}
        />

        <main className="flex flex-1 flex-col overflow-hidden">
          {arenaMode ? (
            <ArenaView
              models={models}
              onSyncOllama={syncOllama}
              modelsLoading={modelsLoading}
              settings={settings}
              mode={mode}
              onModeChange={handleModeChange}
            />
          ) : (
            <ChatInterface
              models={models}
              selectedModel={selectedModel}
              onModelChange={setSelectedModel}
              onSyncOllama={syncOllama}
              modelsLoading={modelsLoading}
              settings={settings}
              mode={mode}
              onModeChange={handleModeChange}
              conversationId={currentConversationId}
              onConversationChange={(id) => {
                setCurrentConversationId(id);
                sidebarRefreshRef.current?.();
              }}
              onConversationTitleUpdate={(id, title) => {
                sidebarTitleUpdateRef.current?.(id, title);
              }}
            />
          )}
          <Footer />
        </main>
      </div>

      <SettingsDrawer
        open={settingsOpen}
        onOpenChange={setSettingsOpen}
        settings={settings}
        onSettingsChange={handleSettingsChange}
      />
    </div>
  );
}
