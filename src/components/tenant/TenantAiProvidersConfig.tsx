'use client';

import { useCallback, useEffect, useState } from 'react';

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

const COST_CONFIG: Record<string, { label: string; color: string; bg: string }> = {
  low: { label: 'Económico', color: 'text-emerald-400', bg: 'bg-emerald-500/15' },
  medium: { label: 'Medio', color: 'text-amber-400', bg: 'bg-amber-500/15' },
  high: { label: 'Alto', color: 'text-red-400', bg: 'bg-red-500/15' },
};

const PROVIDER_ICON: Record<string, string> = {
  anthropic: '\u{1F7E3}',
  openai: '\u{1F7E2}',
  google: '\u{1F535}',
};

function CostBadge({ tier }: { tier: string }) {
  const c = COST_CONFIG[tier] ?? COST_CONFIG.medium;
  return (
    <span className={`inline-flex items-center rounded-md px-2 py-0.5 text-[10px] font-medium ${c.bg} ${c.color}`}>
      {c.label}
    </span>
  );
}

export function TenantAiProvidersConfig() {
  const [providers, setProviders] = useState<AiProvider[]>([]);
  const [loading, setLoading] = useState(true);
  const [syncing, setSyncing] = useState(false);
  const [configOpen, setConfigOpen] = useState(false);
  const [selectedProvider, setSelectedProvider] = useState<AiProvider | null>(null);
  const [activating, setActivating] = useState<string | null>(null);

  const fetchProviders = useCallback(async () => {
    try {
      const res = await fetch('/api/tenant/ai-providers');
      const json = await res.json();
      if (json.success) setProviders(json.data);
    } catch {
      /* ignore */
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    fetchProviders();
  }, [fetchProviders]);

  const handleSync = async () => {
    setSyncing(true);
    try {
      const res = await fetch('/api/tenant/ai-providers/sync', { method: 'POST' });
      const json = await res.json();
      if (json.success) {
        await fetchProviders();
      }
    } catch {
      /* ignore */
    } finally {
      setSyncing(false);
    }
  };

  useEffect(() => {
    if (!loading && providers.length === 0) {
      handleSync();
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [loading]);

  const activeProvider = providers.find((p) => p.isActive && p.hasApiKey);
  const activeModel = activeProvider?.models.find((m) => m.isDefault);
  const configuredCount = providers.filter((p) => p.hasApiKey).length;

  const handleActivate = async (providerId: string) => {
    setActivating(providerId);
    try {
      const res = await fetch(`/api/tenant/ai-providers/${providerId}`, {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ isActive: true }),
      });
      const json = await res.json();
      if (json.success) await fetchProviders();
    } catch {
      /* ignore */
    } finally {
      setActivating(null);
    }
  };

  if (loading) {
    return (
      <div className="flex items-center justify-center py-12">
        <svg className="h-6 w-6 animate-spin text-gray-400" viewBox="0 0 24 24">
          <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4" fill="none" />
          <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4z" />
        </svg>
      </div>
    );
  }

  return (
    <div className="space-y-6">
      {/* Active banner */}
      <div className="rounded-xl border border-gray-200 bg-white p-5 dark:border-gray-800 dark:bg-gray-900">
        <p className="mb-2 text-xs font-semibold uppercase tracking-wider text-gray-500 dark:text-gray-400">
          Proveedor activo
        </p>
        {activeProvider && activeModel ? (
          <div className="flex items-center gap-3">
            <span className="text-2xl">{PROVIDER_ICON[activeProvider.providerType] ?? '\u{1F916}'}</span>
            <div className="flex-1">
              <p className="font-medium text-gray-900 dark:text-gray-100">
                {activeModel.displayName}
                <span className="ml-1.5 text-sm font-normal text-gray-500">({activeProvider.name})</span>
              </p>
              {activeModel.description && (
                <p className="text-xs text-gray-500">{activeModel.description}</p>
              )}
            </div>
            <CostBadge tier={activeModel.costTier} />
          </div>
        ) : (
          <p className="text-sm text-gray-500">
            {configuredCount > 0
              ? `${configuredCount} proveedor${configuredCount > 1 ? 'es' : ''} configurado${configuredCount > 1 ? 's' : ''}. Activa uno.`
              : 'Sin configurar. Agrega una API key a un proveedor.'}
          </p>
        )}
      </div>

      {/* Sync button */}
      <div className="flex justify-end">
        <button
          onClick={handleSync}
          disabled={syncing}
          className="rounded-lg border border-gray-200 bg-white px-3 py-1.5 text-xs font-medium text-gray-700 transition-colors hover:bg-gray-50 disabled:opacity-50 dark:border-gray-700 dark:bg-gray-800 dark:text-gray-300 dark:hover:bg-gray-700"
        >
          {syncing ? 'Sincronizando...' : 'Sincronizar catálogo'}
        </button>
      </div>

      {/* Provider cards */}
      <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
        {providers.map((provider) => {
          const isConfigured = provider.hasApiKey;
          const isActive = provider.isActive && isConfigured;
          const defaultModel = provider.models.find((m) => m.isDefault);

          return (
            <div
              key={provider.id}
              className={`rounded-xl border p-5 transition-colors ${
                isActive
                  ? 'border-teal-500/50 bg-teal-500/5 dark:border-teal-500/30'
                  : 'border-gray-200 bg-white dark:border-gray-800 dark:bg-gray-900'
              }`}
            >
              <div className="mb-3 flex items-center justify-between">
                <div className="flex items-center gap-2">
                  <span className="text-lg">{PROVIDER_ICON[provider.providerType] ?? '\u{1F916}'}</span>
                  <span className="text-sm font-semibold text-gray-900 dark:text-gray-100">
                    {provider.name}
                  </span>
                </div>
                <div className="flex items-center gap-1.5">
                  {isActive && (
                    <span className="rounded-full bg-teal-500/15 px-2 py-0.5 text-[10px] font-medium text-teal-500">
                      Activo
                    </span>
                  )}
                  {isConfigured && !isActive && (
                    <span className="rounded-full bg-emerald-500/15 px-2 py-0.5 text-[10px] font-medium text-emerald-400">
                      API Key
                    </span>
                  )}
                  {!isConfigured && (
                    <span className="rounded-full bg-gray-500/15 px-2 py-0.5 text-[10px] font-medium text-gray-400">
                      Sin configurar
                    </span>
                  )}
                </div>
              </div>

              <p className="mb-4 text-xs text-gray-500">
                {isConfigured ? (
                  <>
                    {provider.apiKeyMasked}
                    {defaultModel && <span className="ml-1"> &middot; {defaultModel.displayName}</span>}
                  </>
                ) : (
                  'Sin API key'
                )}
              </p>

              <div className="space-y-2">
                <button
                  onClick={() => {
                    setSelectedProvider(provider);
                    setConfigOpen(true);
                  }}
                  className="flex w-full items-center justify-center rounded-lg border border-gray-200 bg-white px-3 py-2 text-xs font-medium text-gray-700 transition-colors hover:bg-gray-50 dark:border-gray-700 dark:bg-gray-800 dark:text-gray-300 dark:hover:bg-gray-700"
                >
                  {isConfigured ? 'Editar configuración' : 'Configurar'}
                </button>
                {isConfigured && !isActive && (
                  <button
                    onClick={() => handleActivate(provider.id)}
                    disabled={activating === provider.id}
                    className="flex w-full items-center justify-center rounded-lg bg-teal-600 px-3 py-2 text-xs font-medium text-white transition-colors hover:bg-teal-700 disabled:opacity-50"
                  >
                    {activating === provider.id ? 'Activando...' : 'Usar este proveedor'}
                  </button>
                )}
              </div>
            </div>
          );
        })}
      </div>

      {/* Config dialog */}
      {configOpen && selectedProvider && (
        <ProviderConfigDialog
          provider={selectedProvider}
          onClose={() => {
            setConfigOpen(false);
            setSelectedProvider(null);
            fetchProviders();
          }}
        />
      )}
    </div>
  );
}

/* ── Provider Config Dialog ── */

function ProviderConfigDialog({
  provider,
  onClose,
}: {
  provider: AiProvider;
  onClose: () => void;
}) {
  const [apiKey, setApiKey] = useState('');
  const [isEditingKey, setIsEditingKey] = useState(!provider.hasApiKey);
  const [baseUrl, setBaseUrl] = useState(provider.baseUrl ?? '');
  const [selectedModelId, setSelectedModelId] = useState(
    provider.models.find((m) => m.isDefault)?.id ?? provider.models[0]?.id ?? '',
  );
  const [showKey, setShowKey] = useState(false);
  const [revealedKey, setRevealedKey] = useState<string | null>(null);
  const [revealLoading, setRevealLoading] = useState(false);
  const [saving, setSaving] = useState(false);
  const [testing, setTesting] = useState(false);
  const [testResult, setTestResult] = useState<{ ok: boolean; msg: string } | null>(null);

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
      }
    } catch {
      /* ignore */
    } finally {
      setRevealLoading(false);
    }
  };

  const handleSave = async () => {
    if (!apiKey && !provider.hasApiKey) return;
    setSaving(true);
    try {
      const body: Record<string, unknown> = { isActive: true };
      if (apiKey) body.apiKey = apiKey;
      if (baseUrl !== (provider.baseUrl ?? '')) body.baseUrl = baseUrl || null;

      const res = await fetch(`/api/tenant/ai-providers/${provider.id}`, {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(body),
      });
      const json = await res.json();
      if (!json.success) throw new Error(json.error);

      if (selectedModelId) {
        await fetch(`/api/tenant/ai-providers/${selectedModelId}/set-default-model`, {
          method: 'PUT',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ modelId: selectedModelId }),
        });
      }
      onClose();
    } catch {
      /* ignore */
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
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ modelId: testModelId, ...(apiKey ? { apiKey } : {}) }),
      });
      const json = await res.json();
      setTestResult(json.success ? { ok: true, msg: 'Conexión exitosa' } : { ok: false, msg: json.error ?? 'Error' });
    } catch {
      setTestResult({ ok: false, msg: 'No se pudo conectar' });
    } finally {
      setTesting(false);
    }
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center">
      <div className="absolute inset-0 bg-black/50" onClick={onClose} />
      <div className="relative w-full max-w-lg rounded-2xl border border-gray-200 bg-white p-6 shadow-xl dark:border-gray-700 dark:bg-gray-900">
        <div className="mb-5 flex items-center gap-2">
          <span className="text-lg">{PROVIDER_ICON[provider.providerType] ?? '\u{1F916}'}</span>
          <h2 className="text-lg font-semibold text-gray-900 dark:text-gray-100">
            Configurar {provider.name}
          </h2>
        </div>

        <div className="space-y-5">
          {/* API Key */}
          <div className="space-y-2">
            <label className="text-xs font-medium text-gray-700 dark:text-gray-300">API Key</label>
            {provider.hasApiKey && !isEditingKey ? (
              <div className="space-y-1.5">
                <div className="relative">
                  <input
                    type={showKey ? 'text' : 'password'}
                    value={showKey && revealedKey ? revealedKey : provider.apiKeyMasked ?? '••••••••'}
                    readOnly
                    className="w-full rounded-lg border border-gray-200 bg-gray-50 px-3 py-2 pr-10 text-sm text-gray-700 dark:border-gray-700 dark:bg-gray-800 dark:text-gray-300"
                  />
                  <button
                    type="button"
                    onClick={handleRevealKey}
                    disabled={revealLoading}
                    className="absolute right-2.5 top-1/2 -translate-y-1/2 text-gray-400 hover:text-gray-600 dark:hover:text-gray-200"
                  >
                    {revealLoading ? '...' : showKey ? '🙈' : '👁'}
                  </button>
                </div>
                <button
                  type="button"
                  onClick={() => {
                    setIsEditingKey(true);
                    setApiKey('');
                    setShowKey(false);
                    setRevealedKey(null);
                  }}
                  className="text-xs text-teal-500 hover:underline"
                >
                  Cambiar API key
                </button>
              </div>
            ) : (
              <div className="space-y-1.5">
                <input
                  type={showKey ? 'text' : 'password'}
                  placeholder="Ingresa la API key"
                  value={apiKey}
                  onChange={(e) => setApiKey(e.target.value)}
                  className="w-full rounded-lg border border-gray-200 bg-white px-3 py-2 text-sm dark:border-gray-700 dark:bg-gray-800 dark:text-gray-200"
                  autoFocus
                />
                {provider.hasApiKey && (
                  <button
                    type="button"
                    onClick={() => {
                      setIsEditingKey(false);
                      setApiKey('');
                    }}
                    className="text-xs text-gray-400 hover:text-gray-600"
                  >
                    Cancelar
                  </button>
                )}
              </div>
            )}
            <p className="text-[10px] text-gray-400">Almacenada con cifrado AES-256-GCM</p>
          </div>

          {/* Base URL */}
          <div className="space-y-2">
            <label className="text-xs font-medium text-gray-700 dark:text-gray-300">URL base (opcional)</label>
            <input
              type="url"
              value={baseUrl}
              onChange={(e) => setBaseUrl(e.target.value)}
              placeholder="https://..."
              className="w-full rounded-lg border border-gray-200 bg-white px-3 py-2 text-sm dark:border-gray-700 dark:bg-gray-800 dark:text-gray-200"
            />
          </div>

          {/* Model selection */}
          <div className="space-y-2">
            <label className="text-xs font-medium text-gray-700 dark:text-gray-300">Modelo</label>
            <div className="max-h-48 space-y-1.5 overflow-y-auto">
              {provider.models
                .filter((m) => m.isActive)
                .map((model) => (
                  <label
                    key={model.id}
                    className={`flex cursor-pointer items-center gap-3 rounded-lg border px-3 py-2.5 text-sm transition-colors ${
                      selectedModelId === model.id
                        ? 'border-teal-500 bg-teal-500/5'
                        : 'border-gray-200 hover:bg-gray-50 dark:border-gray-700 dark:hover:bg-gray-800'
                    }`}
                  >
                    <input
                      type="radio"
                      name="model"
                      checked={selectedModelId === model.id}
                      onChange={() => setSelectedModelId(model.id)}
                      className="accent-teal-500"
                    />
                    <div className="min-w-0 flex-1">
                      <p className="font-medium text-gray-900 dark:text-gray-100">
                        {model.displayName}
                        {model.isDefault && (
                          <span className="ml-1 text-[10px] text-teal-500"> ★ Actual</span>
                        )}
                      </p>
                      {model.description && (
                        <p className="truncate text-[11px] text-gray-500">{model.description}</p>
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
              className={`rounded-lg border px-3 py-2 text-sm ${
                testResult.ok
                  ? 'border-emerald-500/30 bg-emerald-500/10 text-emerald-400'
                  : 'border-red-500/30 bg-red-500/10 text-red-400'
              }`}
            >
              {testResult.ok ? '✓' : '✗'} {testResult.msg}
            </div>
          )}

          {/* Actions */}
          <div className="flex items-center gap-2">
            <button
              onClick={handleTest}
              disabled={testing || (!apiKey && !provider.hasApiKey)}
              className="rounded-lg border border-gray-200 bg-white px-4 py-2 text-xs font-medium text-gray-700 transition-colors hover:bg-gray-50 disabled:opacity-50 dark:border-gray-700 dark:bg-gray-800 dark:text-gray-300"
            >
              {testing ? 'Probando...' : 'Probar conexión'}
            </button>
            <div className="flex-1" />
            <button
              onClick={onClose}
              className="rounded-lg px-4 py-2 text-xs font-medium text-gray-500 hover:text-gray-700 dark:text-gray-400 dark:hover:text-gray-200"
            >
              Cancelar
            </button>
            <button
              onClick={handleSave}
              disabled={saving || (!apiKey && !provider.hasApiKey)}
              className="rounded-lg bg-teal-600 px-4 py-2 text-xs font-medium text-white transition-colors hover:bg-teal-700 disabled:opacity-50"
            >
              {saving ? 'Guardando...' : 'Guardar y activar'}
            </button>
          </div>
        </div>
      </div>
    </div>
  );
}
