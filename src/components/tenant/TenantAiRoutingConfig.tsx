"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import { Surface, Spinner, Tag } from "@/components/opai-ds";

type AiModule = { id: string; label: string; description: string; aiSubmodules: string[] };
type ProviderModel = { modelId: string; displayName: string; costTier: string; isDefault: boolean };
type Provider = {
  providerType: string;
  name: string;
  isActive: boolean;
  hasApiKey: boolean;
  models: ProviderModel[];
};
type Route = { providerType: string; modelId: string };
type Routing = Record<string, Route>;
type DefaultProvider = { providerType: string; name: string; modelId: string; displayName: string } | null;

type ApiData = {
  modules: AiModule[];
  providers: Provider[];
  routing: Routing;
  defaultProvider: DefaultProvider;
};

const PROVIDER_ICON: Record<string, string> = {
  anthropic: "\u{1F7E3}",
  openai: "\u{1F7E2}",
  google: "\u{1F535}",
};

function routeValue(r?: Route): string {
  return r ? `${r.providerType}:${r.modelId}` : "";
}

export function TenantAiRoutingConfig() {
  const [data, setData] = useState<ApiData | null>(null);
  const [routing, setRouting] = useState<Routing>({});
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [dirty, setDirty] = useState(false);
  const [msg, setMsg] = useState<{ ok: boolean; text: string } | null>(null);

  const load = useCallback(async () => {
    setLoading(true);
    try {
      const res = await fetch("/api/tenant/ai-providers/routing");
      const json = await res.json();
      if (json.success) {
        setData(json.data as ApiData);
        setRouting(json.data.routing ?? {});
        setDirty(false);
      }
    } catch {
      /* ignore */
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    load();
  }, [load]);

  // Opciones planas: cada modelo de cada proveedor configurado.
  const options = useMemo(() => {
    const opts: { value: string; label: string }[] = [];
    for (const p of data?.providers ?? []) {
      if (!p.hasApiKey) continue;
      for (const m of p.models) {
        opts.push({
          value: `${p.providerType}:${m.modelId}`,
          label: `${PROVIDER_ICON[p.providerType] ?? ""} ${m.displayName} · ${p.name}`.trim(),
        });
      }
    }
    return opts;
  }, [data]);

  const setModuleRoute = (moduleId: string, value: string) => {
    setRouting((prev) => {
      const next = { ...prev };
      if (!value) {
        delete next[moduleId];
      } else {
        const [providerType, ...rest] = value.split(":");
        next[moduleId] = { providerType, modelId: rest.join(":") };
      }
      return next;
    });
    setDirty(true);
    setMsg(null);
  };

  const handleSave = async () => {
    setSaving(true);
    setMsg(null);
    try {
      const res = await fetch("/api/tenant/ai-providers/routing", {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ routing }),
      });
      const json = await res.json();
      if (!json.success) throw new Error(json.error ?? "Error");
      setRouting(json.data.routing ?? {});
      setDirty(false);
      setMsg({ ok: true, text: "Ruteo guardado" });
    } catch (e) {
      setMsg({ ok: false, text: e instanceof Error ? e.message : "No se pudo guardar" });
    } finally {
      setSaving(false);
    }
  };

  if (loading) {
    return (
      <div className="flex justify-center py-10">
        <Spinner />
      </div>
    );
  }

  const noProviders = (data?.providers ?? []).every((p) => !p.hasApiKey);

  return (
    <div className="space-y-4">
      {/* Base / default */}
      <Surface elevation={1} padding="md" className="space-y-1">
        <p className="text-xs font-semibold uppercase tracking-wider text-ds-text-3">
          Modelo por defecto (base)
        </p>
        {data?.defaultProvider ? (
          <p className="text-ds-body text-ds-text-1">
            {PROVIDER_ICON[data.defaultProvider.providerType] ?? "🤖"} {data.defaultProvider.displayName}
            <span className="text-ds-text-3"> · {data.defaultProvider.name}</span>
          </p>
        ) : (
          <p className="text-ds-body text-status-warn-fg">
            Sin proveedor por defecto. Configura y activa un proveedor arriba: si un módulo no tiene
            override y no hay proveedor por defecto, la IA de ese módulo queda deshabilitada (OPAI no
            costea la IA del tenant).
          </p>
        )}
        <p className="text-[12px] text-ds-text-3">
          Cada módulo usa este modelo salvo que le asignes uno propio abajo. Cubre todos los módulos
          y submódulos de la app.
        </p>
      </Surface>

      {noProviders && (
        <Surface elevation={1} padding="sm" className="border border-status-warn-border bg-status-warn-soft">
          <p className="text-[12px] text-status-warn-fg">
            Aún no hay proveedores con API key. Configura al menos uno arriba para poder rutear por módulo.
          </p>
        </Surface>
      )}

      {/* Módulos */}
      <div className="space-y-2.5">
        {(data?.modules ?? []).map((mod) => {
          const current = routing[mod.id];
          const hasAi = mod.aiSubmodules.length > 0;
          return (
            <Surface key={mod.id} elevation={1} padding="md" className="space-y-2.5">
              <div className="flex flex-col gap-2.5 sm:flex-row sm:items-start sm:justify-between">
                <div className="min-w-0 flex-1">
                  <div className="flex items-center gap-2">
                    <p className="text-ds-body font-semibold text-ds-text-1">{mod.label}</p>
                    {!hasAi && <Tag variant="neutral" size="sm">sin IA aún</Tag>}
                    {current && <Tag variant="info" size="sm">override</Tag>}
                  </div>
                  <p className="text-[12px] text-ds-text-3">{mod.description}</p>
                </div>
                <select
                  aria-label={`Modelo para ${mod.label}`}
                  className="h-10 w-full rounded-lg border border-ds-border-default bg-ds-surface-1 px-3 text-ds-body text-ds-text-1 sm:h-9 sm:w-72"
                  value={routeValue(current)}
                  disabled={noProviders}
                  onChange={(e) => setModuleRoute(mod.id, e.target.value)}
                >
                  <option value="">Usar modelo por defecto</option>
                  {options.map((o) => (
                    <option key={o.value} value={o.value}>
                      {o.label}
                    </option>
                  ))}
                </select>
              </div>
              {hasAi && (
                <ul className="ml-0.5 space-y-0.5 border-t border-ds-border-subtle pt-2">
                  {mod.aiSubmodules.map((s, i) => (
                    <li key={i} className="text-[12px] text-ds-text-3">
                      · {s}
                    </li>
                  ))}
                </ul>
              )}
            </Surface>
          );
        })}
      </div>

      {/* Guardar */}
      <div className="sticky bottom-2 flex items-center justify-end gap-3">
        {msg && (
          <span className={`text-ds-body ${msg.ok ? "text-status-ok-fg" : "text-status-danger-fg"}`}>
            {msg.ok ? "✓" : "✗"} {msg.text}
          </span>
        )}
        <button
          type="button"
          onClick={handleSave}
          disabled={!dirty || saving || noProviders}
          className="ds-tap rounded-lg bg-primary px-4 py-2 text-ds-body font-medium text-primary-foreground disabled:opacity-40"
        >
          {saving ? "Guardando..." : "Guardar ruteo"}
        </button>
      </div>
    </div>
  );
}
