"use client";

import { useCallback, useEffect, useState } from "react";
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { toast } from "sonner";
import {
  Eye,
  EyeOff,
  Loader2,
  CheckCircle2,
  XCircle,
  Plus,
  Sparkles,
  Settings2,
  Shield,
  Power,
  Key,
} from "lucide-react";

// ── Types ──

type AiModel = {
  id: string;
  modelId: string;
  displayName: string;
  description: string | null;
  isDefault: boolean;
  costTier: string;
  isActive: boolean;
};

type AiProvider = {
  id: string;
  name: string;
  providerType: string;
  baseUrl: string | null;
  isActive: boolean;
  hasApiKey: boolean;
  apiKeyMasked: string | null;
  models: AiModel[];
};

const COST_CONFIG: Record<string, { label: string; color: string; bgColor: string }> = {
  low: { label: "Económico", color: "text-emerald-400", bgColor: "bg-emerald-500/15" },
  medium: { label: "Medio", color: "text-amber-400", bgColor: "bg-amber-500/15" },
  high: { label: "Alto", color: "text-red-400", bgColor: "bg-red-500/15" },
};

const PROVIDER_ICON: Record<string, string> = {
  anthropic: "\u{1F7E3}",
  openai: "\u{1F7E2}",
  google: "\u{1F535}",
};

// ── Main Component ──

export function AiProvidersConfigClient() {
  const [providers, setProviders] = useState<AiProvider[]>([]);
  const [loading, setLoading] = useState(true);
  const [configOpen, setConfigOpen] = useState(false);
  const [selectedProvider, setSelectedProvider] = useState<AiProvider | null>(null);
  const [activating, setActivating] = useState<string | null>(null);

  const fetchProviders = useCallback(async () => {
    try {
      const res = await fetch("/api/tenant/ai-providers");
      const json = await res.json();
      if (json.success) setProviders(json.data);
    } catch {
      toast.error("Error al cargar proveedores");
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    fetchProviders();
  }, [fetchProviders]);

  const activeProvider = providers.find((p) => p.isActive && p.hasApiKey);
  const activeModel = activeProvider?.models.find((m) => m.isDefault);
  const configuredProviders = providers.filter((p) => p.hasApiKey);

  const openConfig = (provider: AiProvider) => {
    setSelectedProvider(provider);
    setConfigOpen(true);
  };

  const handleClose = () => {
    setConfigOpen(false);
    setSelectedProvider(null);
    fetchProviders();
  };

  const handleActivate = async (providerId: string) => {
    setActivating(providerId);
    try {
      const res = await fetch(`/api/tenant/ai-providers/${providerId}`, {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ isActive: true }),
      });
      const json = await res.json();
      if (!json.success) throw new Error(json.error);
      const p = providers.find((x) => x.id === providerId);
      toast.success(`${p?.name ?? "Proveedor"} activado como proveedor principal`);
      await fetchProviders();
    } catch (err: unknown) {
      const msg = err instanceof Error ? err.message : "Error al activar";
      toast.error(msg);
    } finally {
      setActivating(null);
    }
  };

  if (loading) {
    return (
      <div className="flex items-center justify-center py-12">
        <Loader2 className="h-6 w-6 animate-spin text-muted-foreground" />
      </div>
    );
  }

  return (
    <div className="space-y-6 min-w-0">
      {/* Active model banner */}
      <Card>
        <CardHeader className="pb-3">
          <div className="flex items-center gap-2">
            <Sparkles className="h-4 w-4 text-primary" />
            <CardTitle className="text-sm">Modelo activo para OPAI</CardTitle>
          </div>
        </CardHeader>
        <CardContent>
          {activeProvider && activeModel ? (
            <div className="flex items-center gap-3">
              <span className="text-lg">
                {PROVIDER_ICON[activeProvider.providerType] ?? "\u{1F916}"}
              </span>
              <div className="flex-1">
                <p className="text-sm font-medium">
                  {activeModel.displayName}
                  <span className="text-muted-foreground font-normal ml-1.5">
                    ({activeProvider.name})
                  </span>
                </p>
                {activeModel.description && (
                  <p className="text-xs text-muted-foreground mt-0.5">
                    {activeModel.description}
                  </p>
                )}
              </div>
              <CostBadge tier={activeModel.costTier} />
            </div>
          ) : configuredProviders.length > 0 ? (
            <div className="flex items-center gap-3 text-muted-foreground">
              <div className="flex h-9 w-9 shrink-0 items-center justify-center rounded-lg bg-amber-500/10">
                <Power className="h-4 w-4 text-amber-400" />
              </div>
              <div className="flex-1">
                <p className="text-sm font-medium text-foreground">
                  Sin proveedor activo
                </p>
                <p className="text-xs">
                  Tienes {configuredProviders.length} proveedor{configuredProviders.length > 1 ? "es" : ""} configurado{configuredProviders.length > 1 ? "s" : ""}. Activa uno para usar funciones de IA.
                </p>
              </div>
            </div>
          ) : (
            <div className="flex items-center gap-3 text-muted-foreground">
              <div className="flex h-9 w-9 shrink-0 items-center justify-center rounded-lg bg-muted">
                <Settings2 className="h-4 w-4" />
              </div>
              <div>
                <p className="text-sm font-medium text-foreground">Sin configurar</p>
                <p className="text-xs">
                  Configura al menos un proveedor para habilitar las funciones de IA
                </p>
              </div>
            </div>
          )}
        </CardContent>
      </Card>

      {/* Provider cards */}
      <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
        {providers.map((provider) => {
          const isConfigured = provider.hasApiKey;
          const isActive = provider.isActive && isConfigured;
          const defaultModel = provider.models.find((m) => m.isDefault);

          return (
            <Card
              key={provider.id}
              className={`relative transition-colors ${isActive ? "border-primary/50 bg-primary/[0.02]" : ""}`}
            >
              <CardHeader className="pb-2">
                <div className="flex items-center justify-between">
                  <div className="flex items-center gap-2">
                    <span className="text-lg">
                      {PROVIDER_ICON[provider.providerType] ?? "\u{1F916}"}
                    </span>
                    <CardTitle className="text-sm">{provider.name}</CardTitle>
                  </div>
                  <div className="flex items-center gap-1.5">
                    {isConfigured && (
                      <Badge variant="success" className="text-[10px]">
                        <Key className="h-2.5 w-2.5 mr-0.5" />
                        API Key
                      </Badge>
                    )}
                    {isActive && (
                      <Badge variant="default" className="text-[10px]">
                        <CheckCircle2 className="h-2.5 w-2.5 mr-0.5" />
                        Activo
                      </Badge>
                    )}
                    {!isConfigured && (
                      <Badge variant="secondary" className="text-[10px]">
                        Sin configurar
                      </Badge>
                    )}
                  </div>
                </div>
                <CardDescription className="text-xs mt-1">
                  {isConfigured ? (
                    <>
                      <span className="text-muted-foreground">
                        {provider.apiKeyMasked}
                      </span>
                      {defaultModel && (
                        <span className="ml-1.5">
                          &middot; {defaultModel.displayName}
                        </span>
                      )}
                    </>
                  ) : (
                    "Sin API key — configura para habilitar"
                  )}
                </CardDescription>
              </CardHeader>
              <CardContent className="pt-2 space-y-2">
                <Button
                  size="sm"
                  variant="outline"
                  className="w-full"
                  onClick={() => openConfig(provider)}
                >
                  <Settings2 className="h-3.5 w-3.5 mr-1.5" />
                  {isConfigured ? "Editar configuración" : "Configurar"}
                </Button>
                {isConfigured && !isActive && (
                  <Button
                    size="sm"
                    className="w-full"
                    onClick={() => handleActivate(provider.id)}
                    disabled={activating === provider.id}
                  >
                    {activating === provider.id ? (
                      <Loader2 className="h-3.5 w-3.5 animate-spin mr-1.5" />
                    ) : (
                      <Power className="h-3.5 w-3.5 mr-1.5" />
                    )}
                    Usar este proveedor
                  </Button>
                )}
              </CardContent>
            </Card>
          );
        })}
      </div>

      {/* Config dialog */}
      {selectedProvider && (
        <ProviderConfigDialog
          provider={selectedProvider}
          open={configOpen}
          onClose={handleClose}
          isOnlyConfigured={configuredProviders.length === 0}
        />
      )}
    </div>
  );
}

// ── Cost Badge ──

function CostBadge({ tier }: { tier: string }) {
  const config = COST_CONFIG[tier] ?? COST_CONFIG.medium;
  return (
    <span
      className={`inline-flex items-center rounded-md px-2 py-0.5 text-[10px] font-medium ${config.bgColor} ${config.color}`}
    >
      {config.label}
    </span>
  );
}

// ── Provider Config Dialog ──

function ProviderConfigDialog({
  provider,
  open,
  onClose,
  isOnlyConfigured,
}: {
  provider: AiProvider;
  open: boolean;
  onClose: () => void;
  isOnlyConfigured: boolean;
}) {
  const [apiKey, setApiKey] = useState("");
  const [isEditingKey, setIsEditingKey] = useState(!provider.hasApiKey);
  const [baseUrl, setBaseUrl] = useState(provider.baseUrl ?? "");
  const [selectedModelId, setSelectedModelId] = useState(
    provider.models.find((m) => m.isDefault)?.id ?? provider.models[0]?.id ?? ""
  );
  const [showKey, setShowKey] = useState(false);
  const [revealedKey, setRevealedKey] = useState<string | null>(null);
  const [revealLoading, setRevealLoading] = useState(false);
  const [saving, setSaving] = useState(false);
  const [testing, setTesting] = useState(false);
  const [testResult, setTestResult] = useState<{ ok: boolean; msg: string } | null>(null);
  const [addModelOpen, setAddModelOpen] = useState(false);

  const handleRevealKey = async () => {
    if (revealedKey) {
      setShowKey(!showKey);
      return;
    }
    setRevealLoading(true);
    try {
      const res = await fetch(`/api/tenant/ai-providers/${provider.id}/key`);
      const json = await res.json();
      if (json.success) {
        setRevealedKey(json.apiKey);
        setShowKey(true);
      } else {
        toast.error("No se pudo obtener la API key");
      }
    } catch {
      toast.error("Error al revelar API key");
    } finally {
      setRevealLoading(false);
    }
  };

  const hasChanges = apiKey || baseUrl !== (provider.baseUrl ?? "") || selectedModelId !== (provider.models.find((m) => m.isDefault)?.id ?? provider.models[0]?.id ?? "");

  const handleSave = async () => {
    if (!apiKey && !provider.hasApiKey) {
      toast.error("Ingresa una API key");
      return;
    }

    setSaving(true);
    try {
      const body: Record<string, unknown> = {};
      if (apiKey) body.apiKey = apiKey;
      if (baseUrl !== (provider.baseUrl ?? "")) body.baseUrl = baseUrl || null;

      // Always activate the provider being configured
      body.isActive = true;

      if (Object.keys(body).length > 0) {
        const res = await fetch(`/api/tenant/ai-providers/${provider.id}`, {
          method: "PUT",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify(body),
        });
        const json = await res.json();
        if (!json.success) throw new Error(json.error);
      }

      if (selectedModelId) {
        await fetch(`/api/config/ai-models/${selectedModelId}/set-default`, {
          method: "PUT",
        });
      }

      toast.success(`${provider.name} guardado correctamente`);
      onClose();
    } catch (err: unknown) {
      const msg = err instanceof Error ? err.message : "Error al guardar";
      toast.error(msg);
    } finally {
      setSaving(false);
    }
  };

  const handleTest = async () => {
    setTesting(true);
    setTestResult(null);

    const testModelId = provider.models.find((m) => m.id === selectedModelId)?.modelId;

    try {
      const res = await fetch(`/api/tenant/ai-providers/${provider.id}/test`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          modelId: testModelId,
          ...(apiKey ? { apiKey } : {}),
        }),
      });
      const json = await res.json();
      if (json.success) {
        setTestResult({ ok: true, msg: "Conexión exitosa" });
      } else {
        setTestResult({ ok: false, msg: json.error ?? "Error desconocido" });
      }
    } catch {
      setTestResult({ ok: false, msg: "No se pudo conectar" });
    } finally {
      setTesting(false);
    }
  };

  const handleAddModel = async (modelId: string, displayName: string, costTier: string) => {
    try {
      const res = await fetch("/api/config/ai-models", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          providerId: provider.id,
          modelId,
          displayName,
          costTier,
        }),
      });
      const json = await res.json();
      if (!json.success) throw new Error(json.error);
      toast.success("Modelo agregado");
      setAddModelOpen(false);
      onClose();
    } catch (err: unknown) {
      const msg = err instanceof Error ? err.message : "Error";
      toast.error(msg);
    }
  };

  return (
    <Dialog open={open} onOpenChange={(v) => !v && onClose()}>
      <DialogContent className="sm:max-w-lg">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            <span className="text-lg">
              {PROVIDER_ICON[provider.providerType] ?? "\u{1F916}"}
            </span>
            Configurar {provider.name}
          </DialogTitle>
        </DialogHeader>

        <div className="space-y-5">
          {/* API Key */}
          <div className="space-y-2">
            <Label htmlFor="apiKey">API Key</Label>
            {provider.hasApiKey && !isEditingKey ? (
              <div className="space-y-2">
                <div className="relative">
                  <Input
                    id="apiKey"
                    type={showKey ? "text" : "password"}
                    value={showKey && revealedKey ? revealedKey : (provider.apiKeyMasked ?? "\u2022\u2022\u2022\u2022\u2022\u2022\u2022\u2022\u2022\u2022\u2022\u2022")}
                    readOnly
                    className="pr-10 bg-muted/50"
                  />
                  <button
                    type="button"
                    onClick={handleRevealKey}
                    disabled={revealLoading}
                    className="absolute right-2.5 top-1/2 -translate-y-1/2 text-muted-foreground hover:text-foreground"
                  >
                    {revealLoading ? (
                      <Loader2 className="h-4 w-4 animate-spin" />
                    ) : showKey ? (
                      <EyeOff className="h-4 w-4" />
                    ) : (
                      <Eye className="h-4 w-4" />
                    )}
                  </button>
                </div>
                <button
                  type="button"
                  onClick={() => {
                    setIsEditingKey(true);
                    setApiKey("");
                    setShowKey(false);
                    setRevealedKey(null);
                  }}
                  className="text-xs text-primary hover:underline"
                >
                  Cambiar API key
                </button>
              </div>
            ) : (
              <div className="space-y-2">
                <div className="relative">
                  <Input
                    id="apiKey"
                    type={showKey ? "text" : "password"}
                    placeholder="Ingresa tu API key"
                    value={apiKey}
                    onChange={(e) => setApiKey(e.target.value)}
                    className="pr-10"
                    autoFocus={isEditingKey && provider.hasApiKey}
                  />
                  <button
                    type="button"
                    onClick={() => setShowKey(!showKey)}
                    className="absolute right-2.5 top-1/2 -translate-y-1/2 text-muted-foreground hover:text-foreground"
                  >
                    {showKey ? (
                      <EyeOff className="h-4 w-4" />
                    ) : (
                      <Eye className="h-4 w-4" />
                    )}
                  </button>
                </div>
                {provider.hasApiKey && (
                  <button
                    type="button"
                    onClick={() => {
                      setIsEditingKey(false);
                      setApiKey("");
                      setShowKey(false);
                    }}
                    className="text-xs text-muted-foreground hover:text-foreground"
                  >
                    Cancelar cambio
                  </button>
                )}
              </div>
            )}
            <p className="flex items-center gap-1 text-[11px] text-muted-foreground">
              <Shield className="h-3 w-3" />
              La API key se almacena encriptada con AES-256
            </p>
          </div>

          {/* Base URL */}
          <div className="space-y-2">
            <Label htmlFor="baseUrl">URL base (opcional)</Label>
            <Input
              id="baseUrl"
              type="url"
              value={baseUrl}
              onChange={(e) => setBaseUrl(e.target.value)}
              placeholder="https://..."
            />
          </div>

          {/* Model selection */}
          <div className="space-y-2">
            <Label>Selecciona modelo</Label>
            <div className="space-y-1.5">
              {provider.models
                .filter((m) => m.isActive)
                .map((model) => (
                  <label
                    key={model.id}
                    className={`flex items-center gap-3 rounded-lg border px-3 py-2.5 cursor-pointer transition-colors ${
                      selectedModelId === model.id
                        ? "border-primary bg-primary/5"
                        : "border-border hover:bg-accent/40"
                    }`}
                  >
                    <input
                      type="radio"
                      name="model"
                      checked={selectedModelId === model.id}
                      onChange={() => setSelectedModelId(model.id)}
                      className="accent-primary"
                    />
                    <div className="flex-1 min-w-0">
                      <p className="text-sm font-medium">
                        {model.displayName}
                        {model.isDefault && (
                          <span className="ml-1.5 text-[10px] text-primary font-normal">
                            ★ Actual
                          </span>
                        )}
                      </p>
                      {model.description && (
                        <p className="text-[11px] text-muted-foreground truncate">
                          {model.description}
                        </p>
                      )}
                    </div>
                    <CostBadge tier={model.costTier} />
                  </label>
                ))}
            </div>
          </div>

          {/* Test result */}
          {testResult && (
            <div
              className={`flex items-center gap-2 rounded-lg border px-3 py-2 text-sm ${
                testResult.ok
                  ? "border-emerald-500/30 bg-emerald-500/10 text-emerald-400"
                  : "border-red-500/30 bg-red-500/10 text-red-400"
              }`}
            >
              {testResult.ok ? (
                <CheckCircle2 className="h-4 w-4 shrink-0" />
              ) : (
                <XCircle className="h-4 w-4 shrink-0" />
              )}
              <span className="truncate">{testResult.msg}</span>
            </div>
          )}

          {/* Actions */}
          <div className="flex items-center gap-2">
            <Button
              variant="outline"
              size="sm"
              onClick={handleTest}
              disabled={testing || (!apiKey && !provider.hasApiKey)}
            >
              {testing ? (
                <Loader2 className="h-3.5 w-3.5 animate-spin mr-1.5" />
              ) : (
                <Sparkles className="h-3.5 w-3.5 mr-1.5" />
              )}
              Probar conexión
            </Button>
            <div className="flex-1" />
            <Button
              size="sm"
              onClick={handleSave}
              disabled={saving || (!apiKey && !provider.hasApiKey && !hasChanges)}
            >
              {saving && <Loader2 className="h-3.5 w-3.5 animate-spin mr-1.5" />}
              Guardar
            </Button>
          </div>

          {!provider.hasApiKey && !apiKey && (
            <p className="text-[11px] text-muted-foreground text-center">
              Ingresa una API key para poder guardar y probar la conexión
            </p>
          )}
          {(provider.hasApiKey || apiKey) && !provider.isActive && (
            <p className="text-[11px] text-muted-foreground text-center">
              Después de guardar, usa &quot;Usar este proveedor&quot; en la tarjeta para activarlo
            </p>
          )}

          {/* Add custom model */}
          <div className="border-t border-border pt-3">
            {addModelOpen ? (
              <AddModelForm
                onSubmit={handleAddModel}
                onCancel={() => setAddModelOpen(false)}
              />
            ) : (
              <button
                onClick={() => setAddModelOpen(true)}
                className="flex items-center gap-1.5 text-xs text-muted-foreground hover:text-foreground transition-colors"
              >
                <Plus className="h-3.5 w-3.5" />
                Agregar modelo personalizado
              </button>
            )}
          </div>
        </div>
      </DialogContent>
    </Dialog>
  );
}

// ── Add Custom Model Form ──

function AddModelForm({
  onSubmit,
  onCancel,
}: {
  onSubmit: (modelId: string, displayName: string, costTier: string) => void;
  onCancel: () => void;
}) {
  const [modelId, setModelId] = useState("");
  const [displayName, setDisplayName] = useState("");
  const [costTier, setCostTier] = useState("medium");

  return (
    <div className="space-y-3">
      <p className="text-xs font-medium">Nuevo modelo personalizado</p>
      <div className="grid gap-3 sm:grid-cols-2">
        <div className="space-y-1">
          <Label className="text-[11px]">ID del modelo</Label>
          <Input
            placeholder="ej: claude-3-haiku-20240307"
            value={modelId}
            onChange={(e) => setModelId(e.target.value)}
            className="h-8 text-xs"
          />
        </div>
        <div className="space-y-1">
          <Label className="text-[11px]">Nombre para mostrar</Label>
          <Input
            placeholder="ej: Claude 3 Haiku"
            value={displayName}
            onChange={(e) => setDisplayName(e.target.value)}
            className="h-8 text-xs"
          />
        </div>
      </div>
      <div className="space-y-1">
        <Label className="text-[11px]">Nivel de costo</Label>
        <div className="flex gap-2">
          {(["low", "medium", "high"] as const).map((tier) => {
            const c = COST_CONFIG[tier];
            return (
              <button
                key={tier}
                type="button"
                onClick={() => setCostTier(tier)}
                className={`rounded-md border px-2.5 py-1 text-[11px] font-medium transition-colors ${
                  costTier === tier
                    ? `${c.bgColor} ${c.color} border-current`
                    : "border-border text-muted-foreground hover:bg-accent/40"
                }`}
              >
                {c.label}
              </button>
            );
          })}
        </div>
      </div>
      <div className="flex items-center gap-2">
        <Button
          size="sm"
          variant="outline"
          className="h-7 text-xs"
          onClick={onCancel}
        >
          Cancelar
        </Button>
        <Button
          size="sm"
          className="h-7 text-xs"
          disabled={!modelId || !displayName}
          onClick={() => onSubmit(modelId, displayName, costTier)}
        >
          Agregar
        </Button>
      </div>
    </div>
  );
}
