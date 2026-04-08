"use client";

import { useEffect, useState, useCallback } from "react";
import { Plus, Trash2 } from "lucide-react";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogDescription,
} from "@/components/ui/dialog";
import { Separator } from "@/components/ui/separator";
import { Label } from "@/components/ui/label";
import { Input } from "@/components/ui/input";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Switch } from "@/components/ui/switch";
import { ParameterSlider } from "@/components/settings/temperature-slider";
import { SystemPrompt } from "@/components/settings/system-prompt";
import { FontSelector } from "@/components/theme/font-selector";
import { apiFetch, deleteModel, deleteProvider } from "@/lib/api-client";
import type { ChatSettings, ProviderInfo, ModelOption } from "@/types";

interface SettingsDrawerProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  settings: ChatSettings;
  onSettingsChange: (update: Partial<ChatSettings>) => void;
}

const EMPTY_FORM = { name: "", base_url: "", api_key: "", model_name: "", version: "" };

export function SettingsDrawer({
  open,
  onOpenChange,
  settings,
  onSettingsChange,
}: SettingsDrawerProps) {
  const [providers, setProviders] = useState<ProviderInfo[]>([]);
  const [models, setModels] = useState<ModelOption[]>([]);
  const [showAddForm, setShowAddForm] = useState(false);
  const [formData, setFormData] = useState(EMPTY_FORM);
  const [saving, setSaving] = useState(false);
  const [activating, setActivating] = useState(false);

  const loadProviders = useCallback(async () => {
    try {
      const data = await apiFetch<ProviderInfo[]>("/v1/providers");
      setProviders(data);
    } catch {}
  }, []);

  const loadModels = useCallback(async () => {
    try {
      const data = await apiFetch<ModelOption[]>("/v1/models");
      setModels(data);
    } catch {}
  }, []);

  useEffect(() => {
    if (open) {
      loadProviders();
      loadModels();
    }
  }, [open, loadProviders, loadModels]);

  // ── Ollama helpers ────────────────────────────────────────
  const ollamaProvider = providers.find((p) => p.name === "ollama");

  const toggleOllama = async () => {
    if (!ollamaProvider) return;
    try {
      await apiFetch(`/v1/providers/${ollamaProvider.id}`, {
        method: "PATCH",
        body: JSON.stringify({ is_enabled: !ollamaProvider.is_enabled }),
      });
      loadProviders();
    } catch {}
  };

  // ── Custom provider: save (provider + model in one flow) ──
  const handleSave = async () => {
    const provName = formData.name.trim().toLowerCase();
    if (!provName || !formData.model_name.trim()) return;
    setSaving(true);
    try {
      // 1) Create or find the provider
      let provider: ProviderInfo | undefined = providers.find(
        (p) => p.name === provName
      );
      if (!provider) {
        provider = await apiFetch<ProviderInfo>("/v1/providers", {
          method: "POST",
          body: JSON.stringify({
            name: provName,
            base_url: formData.base_url.trim(),
            api_key: formData.api_key,
            is_enabled: true,
          }),
        });
      } else {
        // Update existing provider with new key / url if provided
        await apiFetch(`/v1/providers/${provider.id}`, {
          method: "PATCH",
          body: JSON.stringify({
            ...(formData.base_url.trim() ? { base_url: formData.base_url.trim() } : {}),
            ...(formData.api_key ? { api_key: formData.api_key } : {}),
            is_enabled: true,
          }),
        });
      }

      // 2) Register the model
      const modelId = formData.model_name.trim();
      await apiFetch("/v1/models", {
        method: "POST",
        body: JSON.stringify({
          model_id: modelId,
          display_name: modelId,
          provider_name: provName,
          is_local: false,
        }),
      });

      setFormData(EMPTY_FORM);
      setActivating(true);
      await Promise.all([loadProviders(), loadModels()]);
      await new Promise((r) => setTimeout(r, 1500));
      setActivating(false);
      setShowAddForm(false);
    } catch {}
    setSaving(false);
  };

  // ── Custom provider: delete model (and provider if empty) ─
  const handleDeleteCustom = async (model: ModelOption) => {
    try {
      await deleteModel(model.id);
      // Check if this provider has any remaining models
      const remaining = models.filter(
        (m) => m.provider_name === model.provider_name && m.id !== model.id
      );
      if (remaining.length === 0) {
        const prov = providers.find((p) => p.name === model.provider_name);
        if (prov) {
          await deleteProvider(prov.id);
        }
      }
      await Promise.all([loadProviders(), loadModels()]);
    } catch {}
  };

  // Non-ollama models grouped for the "custom providers" section
  const customModels = models.filter((m) => m.provider_name !== "ollama");

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-h-[85vh] overflow-y-auto sm:max-w-lg">
        <DialogHeader>
          <DialogTitle>Settings</DialogTitle>
          <DialogDescription>
            Configure model parameters, API providers, and appearance.
          </DialogDescription>
        </DialogHeader>

        {/* ── Model Parameters ─────────────────────────────── */}
        <div className="space-y-4">
          <h3 className="text-sm font-medium">Model Parameters</h3>
          <ParameterSlider
            label="Temperature"
            value={settings.temperature}
            onChange={(v) => onSettingsChange({ temperature: v })}
            min={0}
            max={2}
            step={0.1}
          />
          <ParameterSlider
            label="Max Tokens"
            value={settings.maxTokens}
            onChange={(v) => onSettingsChange({ maxTokens: v })}
            min={128}
            max={16384}
            step={128}
          />
          <ParameterSlider
            label="Top P"
            value={settings.topP}
            onChange={(v) => onSettingsChange({ topP: v })}
            min={0}
            max={1}
            step={0.05}
          />
          <SystemPrompt
            value={settings.systemPrompt}
            onChange={(v) => onSettingsChange({ systemPrompt: v })}
          />
        </div>

        <Separator />

        {/* ── API Providers ────────────────────────────────── */}
        <div className="space-y-3">
          <h3 className="text-sm font-medium">API Providers</h3>

          {/* Ollama — always first, built-in */}
          {ollamaProvider && (
            <div className="rounded-lg border px-3 py-2.5 space-y-2">
              <div className="flex items-center justify-between">
                <div className="flex items-center gap-2">
                  <span className="text-sm font-medium">Ollama</span>
                  <Badge variant="secondary" className="text-[10px]">Built-in</Badge>
                </div>
                <Switch
                  checked={ollamaProvider.is_enabled}
                  onCheckedChange={toggleOllama}
                />
              </div>
              {ollamaProvider.base_url && (
                <p className="text-[10px] text-muted-foreground truncate">
                  {ollamaProvider.base_url}
                </p>
              )}
            </div>
          )}

          {/* Custom provider cards */}
          {customModels.map((m) => {
            const prov = providers.find((p) => p.name === m.provider_name);
            return (
              <div
                key={m.id}
                className="group flex items-center justify-between rounded-lg border px-3 py-2.5"
              >
                <div className="min-w-0 flex-1">
                  <div className="flex items-center gap-2">
                    <span className="text-sm font-medium capitalize">
                      {m.provider_name}
                    </span>
                    <Badge variant="default" className="text-[10px] bg-green-600 hover:bg-green-600">
                      Active
                    </Badge>
                  </div>
                  <p className="text-[10px] text-muted-foreground truncate">
                    {prov?.base_url || "—"} · {m.model_id}
                  </p>
                </div>
                <button
                  type="button"
                  onClick={() => handleDeleteCustom(m)}
                  className="ml-2 shrink-0 opacity-0 group-hover:opacity-100 transition-opacity text-muted-foreground hover:text-destructive"
                >
                  <Trash2 className="h-4 w-4" />
                </button>
              </div>
            );
          })}

          {/* Add Custom Provider form / button */}
          {showAddForm ? (
            <div className="rounded-lg border p-3 space-y-2">
              <Input
                placeholder="Provider name (e.g. OpenAI, Groq, Mistral)"
                value={formData.name}
                onChange={(e) =>
                  setFormData((prev) => ({ ...prev, name: e.target.value }))
                }
                className="h-8 text-xs"
              />
              <Input
                placeholder="Base URL (e.g. https://api.openai.com/v1)"
                value={formData.base_url}
                onChange={(e) =>
                  setFormData((prev) => ({ ...prev, base_url: e.target.value }))
                }
                className="h-8 text-xs"
              />
              <Input
                type="password"
                placeholder="API Key"
                value={formData.api_key}
                onChange={(e) =>
                  setFormData((prev) => ({ ...prev, api_key: e.target.value }))
                }
                className="h-8 text-xs"
              />
              <Input
                placeholder="Model name (e.g. gpt-4o, mistral-large)"
                value={formData.model_name}
                onChange={(e) =>
                  setFormData((prev) => ({ ...prev, model_name: e.target.value }))
                }
                className="h-8 text-xs"
              />
              <Input
                placeholder="Version (optional, e.g. 2024-02-01)"
                value={formData.version}
                onChange={(e) =>
                  setFormData((prev) => ({ ...prev, version: e.target.value }))
                }
                className="h-8 text-xs"
              />
              <div className="flex gap-2 pt-1">
                <Button
                  size="sm"
                  onClick={handleSave}
                  disabled={!formData.name.trim() || !formData.model_name.trim() || saving || activating}
                  className="h-8 text-xs"
                >
                  {activating ? "Activating model…" : saving ? "Saving…" : "Save"}
                </Button>
                <Button
                  size="sm"
                  variant="ghost"
                  onClick={() => {
                    setShowAddForm(false);
                    setFormData(EMPTY_FORM);
                  }}
                  className="h-8 text-xs"
                >
                  Cancel
                </Button>
              </div>
            </div>
          ) : (
            <Button
              variant="outline"
              size="sm"
              onClick={() => setShowAddForm(true)}
              className="w-full h-8 text-xs gap-1"
            >
              <Plus className="h-3.5 w-3.5" />
              Add Custom Provider
            </Button>
          )}
        </div>

        <Separator />

        {/* ── Registered Models ────────────────────────────── */}
        <div className="space-y-3">
          <h3 className="text-sm font-medium">Registered Models</h3>
          {models.length === 0 && (
            <p className="text-xs text-muted-foreground">
              No models registered yet. Sync Ollama or add a custom provider above.
            </p>
          )}
          {models.map((m) => (
            <div
              key={m.id}
              className="flex items-center justify-between rounded-lg border px-3 py-2"
            >
              <div className="min-w-0 flex-1">
                <p className="text-sm font-medium truncate">{m.display_name}</p>
                <p className="text-[10px] text-muted-foreground">
                  {m.provider_name} · {m.model_id}
                </p>
              </div>
              <Badge
                variant={m.is_local ? "secondary" : "outline"}
                className="ml-2 text-[10px] shrink-0"
              >
                {m.is_local ? "Local" : "Cloud"}
              </Badge>
            </div>
          ))}
        </div>

        <Separator />

        {/* ── Appearance ───────────────────────────────────── */}
        <div className="space-y-3">
          <h3 className="text-sm font-medium">Appearance</h3>
          <div className="flex items-center justify-between">
            <Label className="text-xs">Font Family</Label>
            <FontSelector />
          </div>
        </div>
      </DialogContent>
    </Dialog>
  );
}
