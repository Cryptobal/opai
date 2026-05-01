"use client";

import { useCallback, useEffect, useState } from "react";
import { toast } from "sonner";
import { Card, CardContent } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Loader2, Save, Zap, Radio, AlertTriangle, Clock } from "lucide-react";
import { cn } from "@/lib/utils";
import {
  ALERT_CATALOG,
  CONFIGURABLE_ALERT_CODES,
  type AlertTypeCode,
  type AlertSeverity,
} from "@/lib/rondas/alert-catalog";

// ── Types matching server's FullAlertConfig shape ──

interface AlertTypeConfig {
  enabled: boolean;
  severity: AlertSeverity;
  thresholds: Record<string, number>;
}

type FullConfig = Record<AlertTypeCode, AlertTypeConfig>;

// ── Severity helpers ──

const SEVERITY_COLORS: Record<AlertSeverity, { bg: string; text: string; ring: string }> = {
  critical: { bg: "bg-status-danger-soft", text: "text-status-danger-fg", ring: "ring-red-500/30" },
  warning: { bg: "bg-status-warn-soft", text: "text-status-warn-fg", ring: "ring-amber-500/30" },
  info: { bg: "bg-status-info-soft", text: "text-status-info-fg", ring: "ring-blue-500/30" },
};

const SEVERITY_LABELS: Record<AlertSeverity, string> = {
  critical: "Crítica",
  warning: "Warning",
  info: "Info",
};

const SEVERITIES: AlertSeverity[] = ["critical", "warning", "info"];

// ── Group configurable alerts by source ──

const SOURCE_GROUPS: Array<{
  source: string;
  label: string;
  icon: typeof Radio;
  codes: AlertTypeCode[];
}> = [
  {
    source: "anomaly_inline",
    label: "Detección en tiempo real",
    icon: Radio,
    codes: CONFIGURABLE_ALERT_CODES.filter((c) => ALERT_CATALOG[c].source === "anomaly_inline"),
  },
  {
    source: "post_mark",
    label: "Análisis post-marcación",
    icon: AlertTriangle,
    codes: CONFIGURABLE_ALERT_CODES.filter((c) => ALERT_CATALOG[c].source === "post_mark"),
  },
  {
    source: "scheduler",
    label: "Programación",
    icon: Clock,
    codes: CONFIGURABLE_ALERT_CODES.filter((c) => ALERT_CATALOG[c].source === "scheduler"),
  },
];

// ── Toggle ──

function Toggle({ checked, onChange }: { checked: boolean; onChange: (v: boolean) => void }) {
  return (
    <button
      type="button"
      role="switch"
      aria-checked={checked}
      onClick={() => onChange(!checked)}
      className={cn(
        "relative inline-flex h-5 w-9 shrink-0 cursor-pointer rounded-full transition-colors duration-200",
        checked ? "bg-primary" : "bg-muted",
      )}
    >
      <span
        className={cn(
          "pointer-events-none block h-4 w-4 rounded-full bg-white shadow-sm transition-transform duration-200 mt-0.5",
          checked ? "translate-x-[18px]" : "translate-x-0.5",
        )}
      />
    </button>
  );
}

// ── Main component ──

export function IaUmbralesConfig() {
  const [config, setConfig] = useState<FullConfig | null>(null);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);

  const fetchConfig = useCallback(async () => {
    try {
      const res = await fetch("/api/ops/rondas/ia/alert-config");
      const json = await res.json();
      if (json.success) setConfig(json.data);
    } catch {
      // leave null → shows error state
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    void fetchConfig();
  }, [fetchConfig]);

  async function handleSave() {
    if (!config) return;
    setSaving(true);
    try {
      const res = await fetch("/api/ops/rondas/ia/alert-config", {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(config),
      });
      const json = await res.json();
      if (json.success) {
        setConfig(json.data);
        toast.success("Configuración de alertas guardada");
      } else {
        toast.error(json.error || "Error guardando");
      }
    } catch {
      toast.error("Error guardando configuración");
    } finally {
      setSaving(false);
    }
  }

  function updateEnabled(code: AlertTypeCode, enabled: boolean) {
    setConfig((prev) => prev && { ...prev, [code]: { ...prev[code], enabled } });
  }

  function updateSeverity(code: AlertTypeCode, severity: AlertSeverity) {
    setConfig((prev) => prev && { ...prev, [code]: { ...prev[code], severity } });
  }

  function updateThreshold(code: AlertTypeCode, key: string, value: number) {
    setConfig((prev) => {
      if (!prev) return prev;
      return {
        ...prev,
        [code]: {
          ...prev[code],
          thresholds: { ...prev[code].thresholds, [key]: value },
        },
      };
    });
  }

  if (loading) {
    return (
      <Card>
        <CardContent className="flex items-center justify-center py-12">
          <Loader2 className="h-5 w-5 animate-spin text-muted-foreground" />
        </CardContent>
      </Card>
    );
  }

  if (!config) {
    return (
      <Card>
        <CardContent className="py-8 text-center text-sm text-muted-foreground">
          Error cargando configuración
        </CardContent>
      </Card>
    );
  }

  return (
    <Card>
      <CardContent className="pt-5 space-y-5">
        <div className="flex items-center gap-2">
          <div className="p-1.5 rounded-lg bg-status-warn-soft">
            <Zap className="h-4 w-4 text-status-warn-fg" />
          </div>
          <div>
            <h3 className="text-sm font-semibold">Configuración de alertas</h3>
            <p className="text-[11px] text-muted-foreground">
              Activa/desactiva alertas, ajusta severidad y umbrales
            </p>
          </div>
        </div>

        {SOURCE_GROUPS.filter((g) => g.codes.length > 0).map((group) => {
          const Icon = group.icon;
          return (
            <div key={group.source} className="space-y-2.5">
              <div className="flex items-center gap-2 pt-1">
                <Icon className="h-3.5 w-3.5 text-muted-foreground" />
                <span className="text-[12px] font-semibold text-muted-foreground uppercase tracking-wider">
                  {group.label}
                </span>
              </div>

              {group.codes.map((code) => {
                const def = ALERT_CATALOG[code];
                const ac = config[code];
                if (!ac) return null;

                return (
                  <div
                    key={code}
                    className={cn(
                      "rounded-lg border p-3 transition-colors",
                      ac.enabled
                        ? "border-border bg-card"
                        : "border-border/40 bg-muted/20 opacity-60",
                    )}
                  >
                    {/* Row: Toggle + label + severity */}
                    <div className="flex items-start gap-3">
                      <div className="pt-0.5">
                        <Toggle checked={ac.enabled} onChange={(v) => updateEnabled(code, v)} />
                      </div>
                      <div className="flex-1 min-w-0">
                        <p className="text-sm font-medium">{def.label}</p>
                        <p className="text-xs text-muted-foreground mt-0.5">{def.description}</p>
                      </div>

                      {/* Severity selector */}
                      <div className="flex gap-1 shrink-0">
                        {SEVERITIES.map((sev) => {
                          const sc = SEVERITY_COLORS[sev];
                          const active = ac.severity === sev;
                          return (
                            <button
                              key={sev}
                              disabled={!ac.enabled}
                              onClick={() => updateSeverity(code, sev)}
                              className={cn(
                                "text-[10px] font-semibold px-2 py-0.5 rounded-full ring-1 transition-all",
                                active
                                  ? `${sc.bg} ${sc.text} ${sc.ring}`
                                  : "ring-transparent text-muted-foreground/40",
                                ac.enabled && !active && "hover:ring-muted-foreground/20",
                              )}
                            >
                              {SEVERITY_LABELS[sev]}
                            </button>
                          );
                        })}
                      </div>
                    </div>

                    {/* Thresholds row */}
                    {def.thresholds && def.thresholds.length > 0 && (
                      <div className="flex flex-wrap gap-3 mt-2.5 pl-12">
                        {def.thresholds.map((tDef) => (
                          <div key={tDef.key} className="flex items-center gap-1.5">
                            <span className="text-[11px] text-muted-foreground">{tDef.label}:</span>
                            <Input
                              type="number"
                              value={ac.thresholds[tDef.key] ?? tDef.defaultValue}
                              onChange={(e) => {
                                const val = parseFloat(e.target.value) || tDef.min;
                                updateThreshold(
                                  code,
                                  tDef.key,
                                  Math.max(tDef.min, Math.min(tDef.max, val)),
                                );
                              }}
                              min={tDef.min}
                              max={tDef.max}
                              step={tDef.step}
                              disabled={!ac.enabled}
                              className="w-20 h-7 text-center text-sm"
                            />
                            {tDef.unit && (
                              <span className="text-[11px] text-muted-foreground">{tDef.unit}</span>
                            )}
                          </div>
                        ))}
                      </div>
                    )}
                  </div>
                );
              })}
            </div>
          );
        })}

        <Button onClick={handleSave} disabled={saving} className="w-full" size="sm">
          {saving ? (
            <Loader2 className="h-3.5 w-3.5 mr-1.5 animate-spin" />
          ) : (
            <Save className="h-3.5 w-3.5 mr-1.5" />
          )}
          Guardar configuración
        </Button>
      </CardContent>
    </Card>
  );
}
