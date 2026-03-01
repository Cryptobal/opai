"use client";

import { useCallback, useEffect, useState } from "react";
import { toast } from "sonner";
import { Card, CardContent } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Loader2, Save, Zap } from "lucide-react";
import { cn } from "@/lib/utils";

interface AlertConfig {
  staticGuardMinutes: number;
  staticGuardEnabled: boolean;
  speedAnomalyKmh: number;
  speedAnomalyEnabled: boolean;
  roundNotStartedMinutes: number;
  roundNotStartedEnabled: boolean;
  checkpointSkippedEnabled: boolean;
  routeDeviationMultiplier: number;
  routeDeviationEnabled: boolean;
}

const DEFAULTS: AlertConfig = {
  staticGuardMinutes: 5,
  staticGuardEnabled: true,
  speedAnomalyKmh: 15,
  speedAnomalyEnabled: true,
  roundNotStartedMinutes: 10,
  roundNotStartedEnabled: true,
  checkpointSkippedEnabled: true,
  routeDeviationMultiplier: 2,
  routeDeviationEnabled: true,
};

interface ThresholdRow {
  key: keyof AlertConfig;
  enableKey: keyof AlertConfig;
  label: string;
  description: string;
  unit: string;
  min: number;
  max: number;
  step: number;
}

const ROWS: ThresholdRow[] = [
  {
    key: "staticGuardMinutes",
    enableKey: "staticGuardEnabled",
    label: "Guardia estático",
    description: "Alertar si no hay movimiento por más de X minutos",
    unit: "min",
    min: 2,
    max: 30,
    step: 1,
  },
  {
    key: "speedAnomalyKmh",
    enableKey: "speedAnomalyEnabled",
    label: "Velocidad anómala",
    description: "Alertar si velocidad supera X km/h entre checkpoints",
    unit: "km/h",
    min: 5,
    max: 50,
    step: 1,
  },
  {
    key: "roundNotStartedMinutes",
    enableKey: "roundNotStartedEnabled",
    label: "Ronda no iniciada",
    description: "Tolerancia post-programación antes de alertar",
    unit: "min",
    min: 5,
    max: 60,
    step: 1,
  },
  {
    key: "routeDeviationMultiplier",
    enableKey: "routeDeviationEnabled",
    label: "Breach de geocerca",
    description: "Multiplicador del radio para considerar válida una marcación",
    unit: "x",
    min: 1.5,
    max: 5,
    step: 0.5,
  },
];

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

export function IaUmbralesConfig() {
  const [config, setConfig] = useState<AlertConfig>(DEFAULTS);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);

  const fetchConfig = useCallback(async () => {
    try {
      const res = await fetch("/api/ops/rondas/ia/config");
      const json = await res.json();
      if (json.success) setConfig(json.data);
    } catch {
      // use defaults
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    void fetchConfig();
  }, [fetchConfig]);

  async function handleSave() {
    setSaving(true);
    try {
      const res = await fetch("/api/ops/rondas/ia/config", {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(config),
      });
      const json = await res.json();
      if (json.success) {
        setConfig(json.data);
        toast.success("Configuración guardada");
      } else {
        toast.error(json.error || "Error guardando");
      }
    } catch {
      toast.error("Error guardando configuración");
    } finally {
      setSaving(false);
    }
  }

  function updateField(key: keyof AlertConfig, value: number | boolean) {
    setConfig((prev) => ({ ...prev, [key]: value }));
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

  return (
    <Card>
      <CardContent className="pt-5">
        <div className="flex items-center gap-2 mb-4">
          <div className="p-1.5 rounded-lg bg-amber-500/15">
            <Zap className="h-4 w-4 text-amber-400" />
          </div>
          <h3 className="text-sm font-semibold">Detección de anomalías</h3>
        </div>

        <div className="space-y-4">
          {ROWS.map((row) => (
            <div
              key={row.key}
              className={cn(
                "flex items-start gap-3 p-3 rounded-lg border transition-colors",
                config[row.enableKey] ? "border-border bg-card" : "border-border/40 bg-muted/20 opacity-60",
              )}
            >
              <div className="pt-0.5">
                <Toggle
                  checked={config[row.enableKey] as boolean}
                  onChange={(v) => updateField(row.enableKey, v)}
                />
              </div>
              <div className="flex-1 min-w-0">
                <p className="text-sm font-medium">{row.label}</p>
                <p className="text-xs text-muted-foreground mt-0.5">{row.description}</p>
              </div>
              <div className="flex items-center gap-1.5 shrink-0">
                <Input
                  type="number"
                  value={config[row.key] as number}
                  onChange={(e) => {
                    const val = parseFloat(e.target.value) || row.min;
                    updateField(row.key, Math.max(row.min, Math.min(row.max, val)));
                  }}
                  min={row.min}
                  max={row.max}
                  step={row.step}
                  disabled={!config[row.enableKey]}
                  className="w-20 h-8 text-center text-sm"
                />
                <span className="text-xs text-muted-foreground w-8">{row.unit}</span>
              </div>
            </div>
          ))}

          {/* Checkpoint saltado — toggle only */}
          <div
            className={cn(
              "flex items-start gap-3 p-3 rounded-lg border transition-colors",
              config.checkpointSkippedEnabled ? "border-border bg-card" : "border-border/40 bg-muted/20 opacity-60",
            )}
          >
            <div className="pt-0.5">
              <Toggle
                checked={config.checkpointSkippedEnabled}
                onChange={(v) => updateField("checkpointSkippedEnabled", v)}
              />
            </div>
            <div className="flex-1 min-w-0">
              <p className="text-sm font-medium">Checkpoint saltado</p>
              <p className="text-xs text-muted-foreground mt-0.5">
                Alertar al omitir un punto en secuencia (plantillas secuenciales)
              </p>
            </div>
          </div>
        </div>

        <Button onClick={handleSave} disabled={saving} className="mt-4 w-full" size="sm">
          {saving ? <Loader2 className="h-3.5 w-3.5 mr-1.5 animate-spin" /> : <Save className="h-3.5 w-3.5 mr-1.5" />}
          Guardar configuración
        </Button>
      </CardContent>
    </Card>
  );
}
