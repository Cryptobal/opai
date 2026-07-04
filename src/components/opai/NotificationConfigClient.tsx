"use client";

import { useCallback, useEffect, useState } from "react";
import { FileText, Save, Loader2, Bell, Smartphone, AlarmClock } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { toast } from "sonner";
import Link from "next/link";
import { PORTAL_NOTIFICATION_TYPES } from "@/lib/pwa/portal-notification-types";

type PushGlobalConfig = Record<string, { pushEnabled: boolean }>;
type SlaPriority = "p1" | "p2" | "p3" | "p4";
type SlaReminderPolicy = {
  intervals: Record<SlaPriority, number>;
  dailyCap: number;
  digestOnly: Record<SlaPriority, boolean>;
};
type Prefs = {
  docExpiryDaysDefault?: number;
  pushGlobalConfig?: PushGlobalConfig;
  slaReminderPolicy?: SlaReminderPolicy;
};

const SLA_PRIORITIES: SlaPriority[] = ["p1", "p2", "p3", "p4"];
const SLA_PRIORITY_LABELS: Record<SlaPriority, string> = {
  p1: "P1 · Crítica",
  p2: "P2 · Alta",
  p3: "P3 · Media",
  p4: "P4 · Baja",
};
const DEFAULT_SLA_POLICY: SlaReminderPolicy = {
  intervals: { p1: 2, p2: 6, p3: 24, p4: 72 },
  dailyCap: 3,
  digestOnly: { p1: false, p2: false, p3: false, p4: false },
};

function defaultPushConfig(): PushGlobalConfig {
  return Object.fromEntries(
    PORTAL_NOTIFICATION_TYPES.map((t) => [t.key, { pushEnabled: t.defaultPush }])
  );
}

export function NotificationConfigClient() {
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [prefs, setPrefs] = useState<Prefs>({});

  const fetchPrefs = useCallback(async () => {
    setLoading(true);
    try {
      const res = await fetch("/api/notifications/config");
      const json = await res.json();
      if (json.success && json.data) setPrefs(json.data);
    } catch {
      toast.error("No se pudieron cargar las preferencias");
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    void fetchPrefs();
  }, [fetchPrefs]);

  const savePrefs = async (updated: Prefs, rollbackTo?: Prefs) => {
    setSaving(true);
    try {
      const res = await fetch("/api/notifications/config", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(updated),
      });
      const json = await res.json();
      if (json.success) {
        toast.success("Guardado");
        if (json.data) setPrefs(json.data);
      } else {
        if (rollbackTo) setPrefs(rollbackTo);
        toast.error(json.error || "Error al guardar");
      }
    } catch {
      if (rollbackTo) setPrefs(rollbackTo);
      toast.error("Error al guardar");
    } finally {
      setSaving(false);
    }
  };

  const handlePushToggle = (key: string, enabled: boolean) => {
    const previous = prefs;
    const current = prefs.pushGlobalConfig ?? defaultPushConfig();
    const updated: Prefs = {
      ...prefs,
      pushGlobalConfig: { ...current, [key]: { pushEnabled: enabled } },
    };
    setPrefs(updated);
    void savePrefs(updated, previous);
  };

  if (loading) {
    return (
      <div className="flex items-center justify-center py-12">
        <Loader2 className="h-6 w-6 animate-spin text-muted-foreground" />
      </div>
    );
  }

  const pushConfig = prefs.pushGlobalConfig ?? defaultPushConfig();
  const sla = prefs.slaReminderPolicy ?? DEFAULT_SLA_POLICY;
  const updateSla = (patch: Partial<SlaReminderPolicy>) =>
    setPrefs((prev) => ({ ...prev, slaReminderPolicy: { ...sla, ...patch } }));

  const portalLabels: Record<string, string> = {
    app: "App OPAI",
    cliente: "Portal Clientes",
    guardia: "Portal Guardias",
    rondas: "Portal Rondas",
  };
  const portalOrder = ["app", "cliente", "guardia", "rondas"] as const;

  return (
    <div className="space-y-6 max-w-2xl">
      <div className="rounded-xl border border-border bg-muted/30 p-4 text-sm text-muted-foreground">
        Las preferencias individuales (qué notificaciones quiere recibir cada usuario) se
        configuran en{" "}
        <Link
          href="/opai/perfil/notificaciones"
          className="text-primary underline hover:no-underline"
        >
          Perfil → Mis notificaciones
        </Link>
        . Aquí controlas los tipos que están activos a nivel global: si desactivas un tipo,
        nadie lo recibe sin importar su preferencia personal.
      </div>

      {/* Push notifications global toggle */}
      <section className="rounded-xl border border-border bg-card p-5 space-y-4">
        <h3 className="text-sm font-semibold flex items-center gap-2">
          <Bell className="h-4 w-4 text-primary" />
          Notificaciones Push — control global
          {saving && (
            <Loader2 className="h-3.5 w-3.5 animate-spin text-muted-foreground ml-auto" />
          )}
        </h3>
        <p className="text-xs text-muted-foreground">
          Activa o desactiva cada tipo de notificación push para todos los portales. Los cambios
          aplican inmediatamente.
        </p>

        {portalOrder.map((portal) => {
          const types = PORTAL_NOTIFICATION_TYPES.filter((t) => t.portals.includes(portal));
          if (types.length === 0) return null;
          return (
            <div key={portal}>
              <p className="text-xs font-semibold text-muted-foreground uppercase tracking-wide mb-2">
                {portalLabels[portal]}
              </p>
              <div className="space-y-2">
                {types.map((t) => {
                  const enabled = pushConfig[t.key]?.pushEnabled ?? t.defaultPush;
                  return (
                    <div
                      key={t.key}
                      className="flex items-center justify-between gap-4 rounded-lg border border-border bg-muted/20 px-4 py-3"
                    >
                      <div className="min-w-0">
                        <p className="text-sm font-medium flex items-center gap-1.5">
                          <Smartphone className="h-3.5 w-3.5 shrink-0 text-muted-foreground" />
                          {t.label}
                        </p>
                        <p className="text-xs text-muted-foreground mt-0.5">{t.description}</p>
                      </div>
                      {/* Toggle button — works regardless of whether Switch component exists */}
                      <button
                        type="button"
                        role="switch"
                        aria-checked={enabled}
                        aria-label={`${enabled ? "Desactivar" : "Activar"} ${t.label}`}
                        onClick={() => handlePushToggle(t.key, !enabled)}
                        disabled={saving}
                        className={`relative inline-flex h-6 w-11 shrink-0 cursor-pointer items-center rounded-full border-2 border-transparent transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2 disabled:cursor-not-allowed disabled:opacity-50 ${
                          enabled ? "bg-primary" : "bg-input"
                        }`}
                      >
                        <span
                          className={`pointer-events-none block h-5 w-5 rounded-full bg-background shadow-lg ring-0 transition-transform ${
                            enabled ? "translate-x-5" : "translate-x-0"
                          }`}
                        />
                      </button>
                    </div>
                  );
                })}
              </div>
            </div>
          );
        })}
      </section>

      {/* Document expiry */}
      <section className="rounded-xl border border-border bg-card p-5">
        <h3 className="text-sm font-semibold mb-3 flex items-center gap-2">
          <FileText className="h-4 w-4 text-primary" />
          Documentos (módulo Documentos)
        </h3>
        <p className="text-xs text-muted-foreground mb-3">
          Define cuántos días antes del vencimiento se considera &quot;por vencer&quot; al crear
          nuevos documentos.
        </p>
        <div className="flex items-center gap-3 py-3">
          <label className="text-xs text-muted-foreground whitespace-nowrap">
            Días antes del vencimiento (default para nuevos docs):
          </label>
          <Input
            type="number"
            min={1}
            max={365}
            className="w-20 text-sm"
            value={Number(prefs.docExpiryDaysDefault ?? 30)}
            onChange={(e) =>
              setPrefs((prev) => ({
                ...prev,
                docExpiryDaysDefault: Math.max(
                  1,
                  Math.min(365, Number(e.target.value) || 30)
                ),
              }))
            }
          />
        </div>
      </section>

      {/* Recordatorios de SLA */}
      <section className="rounded-xl border border-border bg-card p-5 space-y-4">
        <h3 className="text-sm font-semibold flex items-center gap-2">
          <AlarmClock className="h-4 w-4 text-primary" />
          Recordatorios de SLA (tickets)
        </h3>
        <p className="text-xs text-muted-foreground">
          Con qué frecuencia se recuerda un ticket con SLA vencido a su responsable, por
          prioridad. &quot;Solo resumen diario&quot; silencia las campanas de esa prioridad y la
          deja únicamente en el resumen diario. El tope evita el goteo constante.
        </p>

        <div className="space-y-2">
          {SLA_PRIORITIES.map((p) => (
            <div
              key={p}
              className="flex flex-wrap items-center justify-between gap-3 rounded-lg border border-border bg-muted/20 px-4 py-3"
            >
              <span className="text-sm font-medium min-w-[7rem]">{SLA_PRIORITY_LABELS[p]}</span>
              <div className="flex items-center gap-2">
                <label className="text-xs text-muted-foreground">Cada</label>
                <Input
                  type="number"
                  min={1}
                  max={168}
                  className="w-16 text-sm"
                  disabled={sla.digestOnly[p]}
                  value={Number(sla.intervals[p])}
                  onChange={(e) =>
                    updateSla({
                      intervals: {
                        ...sla.intervals,
                        [p]: Math.max(1, Math.min(168, Number(e.target.value) || 1)),
                      },
                    })
                  }
                />
                <span className="text-xs text-muted-foreground">h</span>
              </div>
              <label className="flex items-center gap-2 text-xs text-muted-foreground">
                <button
                  type="button"
                  role="switch"
                  aria-checked={sla.digestOnly[p]}
                  aria-label={`Solo resumen diario para ${SLA_PRIORITY_LABELS[p]}`}
                  onClick={() =>
                    updateSla({ digestOnly: { ...sla.digestOnly, [p]: !sla.digestOnly[p] } })
                  }
                  className={`relative inline-flex h-5 w-9 shrink-0 cursor-pointer items-center rounded-full border-2 border-transparent transition-colors ${
                    sla.digestOnly[p] ? "bg-primary" : "bg-input"
                  }`}
                >
                  <span
                    className={`pointer-events-none block h-4 w-4 rounded-full bg-background shadow transition-transform ${
                      sla.digestOnly[p] ? "translate-x-4" : "translate-x-0"
                    }`}
                  />
                </button>
                Solo resumen diario
              </label>
            </div>
          ))}
        </div>

        <div className="flex items-center gap-3 pt-1">
          <label className="text-xs text-muted-foreground whitespace-nowrap">
            Tope de recordatorios por ticket por día:
          </label>
          <Input
            type="number"
            min={1}
            max={50}
            className="w-20 text-sm"
            value={Number(sla.dailyCap)}
            onChange={(e) =>
              updateSla({ dailyCap: Math.max(1, Math.min(50, Number(e.target.value) || 1)) })
            }
          />
        </div>
      </section>

      <div className="flex justify-end">
        <Button
          onClick={() => void savePrefs(prefs)}
          disabled={saving}
          size="sm"
          className="gap-1.5"
        >
          {saving ? (
            <Loader2 className="h-3.5 w-3.5 animate-spin" />
          ) : (
            <Save className="h-3.5 w-3.5" />
          )}
          Guardar
        </Button>
      </div>
    </div>
  );
}
