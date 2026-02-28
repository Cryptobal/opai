"use client";

import { useCallback, useEffect, useState } from "react";
import { toast } from "sonner";
import {
  Eye,
  EyeOff,
  Check,
  Loader2,
  Zap,
  AlertTriangle,
  Star,
  RefreshCw,
} from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Badge } from "@/components/ui/badge";
import { Card } from "@/components/ui/card";

// ─── Types ───────────────────────────────────────────────────

interface AiModel {
  id: string;
  modelId: string;
  displayName: string;
  description: string | null;
  isDefault: boolean;
  costTier: string;
  isActive: boolean;
}

interface AiProvider {
  id: string;
  name: string;
  providerType: string;
  hasApiKey: boolean;
  maskedApiKey: string | null;
  baseUrl: string | null;
  isActive: boolean;
  models: AiModel[];
}

// ─── Provider icons ──────────────────────────────────────────

const PROVIDER_META: Record<string, { color: string; icon: string }> = {
  anthropic: { color: "bg-orange-50 border-orange-200 dark:bg-orange-950/30 dark:border-orange-800", icon: "🤖" },
  openai: { color: "bg-emerald-50 border-emerald-200 dark:bg-emerald-950/30 dark:border-emerald-800", icon: "⚡" },
  google: { color: "bg-blue-50 border-blue-200 dark:bg-blue-950/30 dark:border-blue-800", icon: "🔷" },
};

const COST_LABELS: Record<string, { label: string; color: string }> = {
  low: { label: "Económico", color: "bg-green-100 text-green-800 dark:bg-green-900/40 dark:text-green-300" },
  medium: { label: "Estándar", color: "bg-yellow-100 text-yellow-800 dark:bg-yellow-900/40 dark:text-yellow-300" },
  high: { label: "Premium", color: "bg-purple-100 text-purple-800 dark:bg-purple-900/40 dark:text-purple-300" },
};

// ─── Component ───────────────────────────────────────────────

export function AiProvidersConfigClient() {
  const [providers, setProviders] = useState<AiProvider[]>([]);
  const [loading, setLoading] = useState(true);
  const [apiKeyInputs, setApiKeyInputs] = useState<Record<string, string>>({});
  const [showApiKey, setShowApiKey] = useState<Record<string, boolean>>({});
  const [saving, setSaving] = useState<Record<string, boolean>>({});
  const [testing, setTesting] = useState<Record<string, boolean>>({});
  const [settingDefault, setSettingDefault] = useState<string | null>(null);

  const fetchProviders = useCallback(async () => {
    try {
      const res = await fetch("/api/config/ai-providers");
      const json = await res.json();
      if (json.success) {
        setProviders(json.data);
      }
    } catch {
      toast.error("Error al cargar proveedores de IA");
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    fetchProviders();
  }, [fetchProviders]);

  const defaultModel = providers
    .flatMap((p) => p.models.map((m) => ({ ...m, providerName: p.name, providerType: p.providerType })))
    .find((m) => m.isDefault);

  // ─── Save API Key ────────────────────────────────────────

  async function handleSaveApiKey(providerId: string) {
    const apiKey = apiKeyInputs[providerId]?.trim();
    if (!apiKey) {
      toast.error("Ingresa una API key");
      return;
    }

    setSaving((s) => ({ ...s, [providerId]: true }));
    try {
      const res = await fetch(`/api/config/ai-providers/${providerId}`, {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ apiKey, isActive: true }),
      });
      const json = await res.json();
      if (json.success) {
        toast.success("API key guardada y proveedor activado");
        setApiKeyInputs((s) => ({ ...s, [providerId]: "" }));
        await fetchProviders();
      } else {
        toast.error(json.error || "Error al guardar");
      }
    } catch {
      toast.error("Error de conexión");
    } finally {
      setSaving((s) => ({ ...s, [providerId]: false }));
    }
  }

  // ─── Toggle provider active ──────────────────────────────

  async function handleToggleActive(providerId: string, isActive: boolean) {
    setSaving((s) => ({ ...s, [providerId]: true }));
    try {
      const res = await fetch(`/api/config/ai-providers/${providerId}`, {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ isActive }),
      });
      const json = await res.json();
      if (json.success) {
        toast.success(isActive ? "Proveedor activado" : "Proveedor desactivado");
        await fetchProviders();
      } else {
        toast.error(json.error || "Error al actualizar");
      }
    } catch {
      toast.error("Error de conexión");
    } finally {
      setSaving((s) => ({ ...s, [providerId]: false }));
    }
  }

  // ─── Test connection ─────────────────────────────────────

  async function handleTestConnection(provider: AiProvider) {
    const apiKey = apiKeyInputs[provider.id]?.trim();
    if (!apiKey && !provider.hasApiKey) {
      toast.error("Ingresa una API key primero");
      return;
    }

    // Use the first active model for testing
    const testModel = provider.models.find((m) => m.isActive);
    if (!testModel) {
      toast.error("No hay modelos activos para probar");
      return;
    }

    setTesting((s) => ({ ...s, [provider.id]: true }));
    try {
      const res = await fetch("/api/config/ai-providers/test", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          providerType: provider.providerType,
          modelId: testModel.modelId,
          apiKey: apiKey || "__use_stored__",
          baseUrl: provider.baseUrl,
        }),
      });
      const json = await res.json();
      if (json.success && json.data?.ok) {
        toast.success(`Conexión exitosa con ${provider.name}`);
      } else {
        toast.error(`Error: ${json.data?.error || json.error || "Fallo de conexión"}`);
      }
    } catch {
      toast.error("Error de conexión");
    } finally {
      setTesting((s) => ({ ...s, [provider.id]: false }));
    }
  }

  // ─── Set default model ───────────────────────────────────

  async function handleSetDefault(modelId: string) {
    setSettingDefault(modelId);
    try {
      const res = await fetch(`/api/config/ai-models/${modelId}/default`, {
        method: "PUT",
      });
      const json = await res.json();
      if (json.success) {
        toast.success(`Modelo predeterminado: ${json.data.displayName}`);
        await fetchProviders();
      } else {
        toast.error(json.error || "Error al configurar modelo");
      }
    } catch {
      toast.error("Error de conexión");
    } finally {
      setSettingDefault(null);
    }
  }

  // ─── Render ──────────────────────────────────────────────

  if (loading) {
    return (
      <div className="flex items-center justify-center py-12">
        <Loader2 className="h-6 w-6 animate-spin text-muted-foreground" />
      </div>
    );
  }

  return (
    <div className="space-y-6">
      {/* Status banner */}
      {defaultModel ? (
        <div className="rounded-lg border bg-primary/5 border-primary/20 p-4 flex items-center gap-3">
          <Zap className="h-5 w-5 text-primary shrink-0" />
          <div className="text-sm">
            <span className="font-medium">Modelo activo:</span>{" "}
            <span className="text-primary font-semibold">{defaultModel.displayName}</span>
            <span className="text-muted-foreground"> ({defaultModel.providerName})</span>
          </div>
        </div>
      ) : (
        <div className="rounded-lg border bg-yellow-50 border-yellow-200 dark:bg-yellow-950/30 dark:border-yellow-800 p-4 flex items-center gap-3">
          <AlertTriangle className="h-5 w-5 text-yellow-600 dark:text-yellow-400 shrink-0" />
          <div className="text-sm text-yellow-800 dark:text-yellow-200">
            <span className="font-medium">Sin configurar.</span>{" "}
            Configura una API key y selecciona un modelo para habilitar las funciones de IA.
          </div>
        </div>
      )}

      {/* Provider cards */}
      {providers.map((provider) => {
        const meta = PROVIDER_META[provider.providerType] ?? {
          color: "bg-gray-50 border-gray-200",
          icon: "🤖",
        };

        return (
          <Card
            key={provider.id}
            className={`p-5 border ${meta.color} transition-shadow`}
          >
            {/* Header */}
            <div className="flex items-center justify-between mb-4">
              <div className="flex items-center gap-3">
                <span className="text-2xl">{meta.icon}</span>
                <div>
                  <h3 className="font-semibold text-base">{provider.name}</h3>
                  <p className="text-xs text-muted-foreground">{provider.providerType}</p>
                </div>
              </div>
              <div className="flex items-center gap-2">
                {provider.isActive ? (
                  <Badge variant="default" className="bg-green-600 hover:bg-green-700 text-xs">
                    Activo
                  </Badge>
                ) : (
                  <Badge variant="secondary" className="text-xs">
                    Inactivo
                  </Badge>
                )}
                {provider.hasApiKey && provider.isActive && (
                  <Button
                    variant="ghost"
                    size="sm"
                    onClick={() => handleToggleActive(provider.id, false)}
                    disabled={saving[provider.id]}
                    className="text-xs h-7"
                  >
                    Desactivar
                  </Button>
                )}
              </div>
            </div>

            {/* API Key section */}
            <div className="mb-4">
              <label className="text-xs font-medium text-muted-foreground mb-1.5 block">
                API Key
              </label>
              {provider.hasApiKey && !apiKeyInputs[provider.id] ? (
                <div className="flex items-center gap-2">
                  <div className="flex-1 rounded-md border bg-muted/50 px-3 py-2 text-sm font-mono text-muted-foreground">
                    {showApiKey[provider.id]
                      ? provider.maskedApiKey
                      : "••••••••••••••••••••"}
                  </div>
                  <Button
                    variant="ghost"
                    size="icon"
                    className="h-9 w-9"
                    onClick={() =>
                      setShowApiKey((s) => ({
                        ...s,
                        [provider.id]: !s[provider.id],
                      }))
                    }
                  >
                    {showApiKey[provider.id] ? (
                      <EyeOff className="h-4 w-4" />
                    ) : (
                      <Eye className="h-4 w-4" />
                    )}
                  </Button>
                  <Button
                    variant="outline"
                    size="sm"
                    className="text-xs"
                    onClick={() =>
                      setApiKeyInputs((s) => ({
                        ...s,
                        [provider.id]: "",
                      }))
                    }
                  >
                    Cambiar
                  </Button>
                  <Button
                    variant="outline"
                    size="sm"
                    className="text-xs"
                    onClick={() => handleTestConnection(provider)}
                    disabled={testing[provider.id]}
                  >
                    {testing[provider.id] ? (
                      <Loader2 className="h-3 w-3 animate-spin mr-1" />
                    ) : (
                      <RefreshCw className="h-3 w-3 mr-1" />
                    )}
                    Probar
                  </Button>
                </div>
              ) : (
                <div className="flex items-center gap-2">
                  <Input
                    type="password"
                    placeholder={`API key de ${provider.name}...`}
                    value={apiKeyInputs[provider.id] ?? ""}
                    onChange={(e) =>
                      setApiKeyInputs((s) => ({
                        ...s,
                        [provider.id]: e.target.value,
                      }))
                    }
                    className="font-mono text-sm"
                  />
                  <Button
                    size="sm"
                    onClick={() => handleSaveApiKey(provider.id)}
                    disabled={saving[provider.id] || !apiKeyInputs[provider.id]?.trim()}
                  >
                    {saving[provider.id] ? (
                      <Loader2 className="h-4 w-4 animate-spin" />
                    ) : (
                      <Check className="h-4 w-4" />
                    )}
                  </Button>
                  {provider.hasApiKey && (
                    <Button
                      variant="ghost"
                      size="sm"
                      className="text-xs"
                      onClick={() =>
                        setApiKeyInputs((s) => {
                          const next = { ...s };
                          delete next[provider.id];
                          return next;
                        })
                      }
                    >
                      Cancelar
                    </Button>
                  )}
                </div>
              )}
            </div>

            {/* Models section */}
            {provider.isActive && provider.hasApiKey && (
              <div>
                <label className="text-xs font-medium text-muted-foreground mb-2 block">
                  Modelos disponibles
                </label>
                <div className="space-y-2">
                  {provider.models
                    .filter((m) => m.isActive)
                    .map((model) => {
                      const cost = COST_LABELS[model.costTier] ?? COST_LABELS.low;
                      return (
                        <div
                          key={model.id}
                          className={`flex items-center justify-between rounded-md border px-3 py-2.5 transition-colors ${
                            model.isDefault
                              ? "border-primary/40 bg-primary/5"
                              : "border-border hover:border-primary/20 hover:bg-accent/30"
                          }`}
                        >
                          <div className="flex items-center gap-3 min-w-0">
                            {model.isDefault && (
                              <Star className="h-4 w-4 text-primary shrink-0 fill-primary" />
                            )}
                            <div className="min-w-0">
                              <p className="text-sm font-medium truncate">
                                {model.displayName}
                              </p>
                              {model.description && (
                                <p className="text-xs text-muted-foreground truncate">
                                  {model.description}
                                </p>
                              )}
                            </div>
                          </div>
                          <div className="flex items-center gap-2 shrink-0 ml-3">
                            <Badge
                              variant="secondary"
                              className={`text-[10px] px-1.5 py-0 ${cost.color}`}
                            >
                              {cost.label}
                            </Badge>
                            {model.isDefault ? (
                              <Badge variant="default" className="text-[10px] px-2 py-0">
                                Predeterminado
                              </Badge>
                            ) : (
                              <Button
                                variant="outline"
                                size="sm"
                                className="text-xs h-7"
                                onClick={() => handleSetDefault(model.id)}
                                disabled={settingDefault === model.id}
                              >
                                {settingDefault === model.id ? (
                                  <Loader2 className="h-3 w-3 animate-spin" />
                                ) : (
                                  "Usar este"
                                )}
                              </Button>
                            )}
                          </div>
                        </div>
                      );
                    })}
                </div>
              </div>
            )}
          </Card>
        );
      })}

      {/* Help text */}
      <p className="text-xs text-muted-foreground text-center pt-2">
        El modelo predeterminado se usa para protocolos, exámenes, cotizaciones y otras funciones de IA.
        <br />
        Las API keys se almacenan cifradas (AES-256-GCM).
      </p>
    </div>
  );
}
