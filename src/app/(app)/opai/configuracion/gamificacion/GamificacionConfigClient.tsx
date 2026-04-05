"use client";

import { useState, useEffect } from "react";

import { LoadingState } from "@/components/opai/LoadingState";
import { EmptyState } from "@/components/opai/EmptyState";
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Switch } from "@/components/ui/switch";
import { DIMENSION_CONFIG } from "@/components/gamification/types";
import { Save } from "lucide-react";
import { toast } from "sonner";

// ── Dimension keys (only the 5 main dimensions) ──

const MAIN_DIMENSIONS = Object.entries(DIMENSION_CONFIG).filter(
  ([key]) => key !== "social" && key !== "bonus"
);

const PESO_FIELDS: Record<string, string> = {
  rondas: "pesoRondas",
  asistencia: "pesoAsistencia",
  sistema_digital: "pesoSistemaDigital",
  supervision: "pesoSupervision",
  capacitacion: "pesoCapacitacion",
};

// ══════════════════════════════════════════════════════════
//  MAIN COMPONENT — Config only (weights, params, toggles)
// ══════════════════════════════════════════════════════════

export function GamificacionConfigClient() {
  const [config, setConfig] = useState<Record<string, any> | null>(null);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);

  useEffect(() => {
    fetch("/api/gamification/config")
      .then((r) => r.json())
      .then((res) => {
        if (res.success) setConfig(res.data);
        else toast.error("Error al cargar configuración");
      })
      .catch(() => toast.error("Error de conexión"))
      .finally(() => setLoading(false));
  }, []);

  const handleSave = async () => {
    if (!config) return;
    setSaving(true);
    try {
      const res = await fetch("/api/gamification/config", {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(config),
      });
      const data = await res.json();
      if (data.success) {
        setConfig(data.data);
        toast.success("Configuración guardada");
      } else {
        toast.error(data.error ?? "Error al guardar");
      }
    } catch {
      toast.error("Error de conexión");
    } finally {
      setSaving(false);
    }
  };

  const updateField = (field: string, value: any) => {
    setConfig((prev) => (prev ? { ...prev, [field]: value } : prev));
  };

  if (loading) return <LoadingState type="skeleton" rows={6} />;
  if (!config) return <EmptyState title="No se pudo cargar la configuración" />;

  const pesoSum = MAIN_DIMENSIONS.reduce(
    (sum, [key]) => sum + (Number(config[PESO_FIELDS[key]]) || 0),
    0
  );

  return (
    <div className="space-y-6">
      {/* Kill Switch */}
      <Card className="border-red-500/20">
        <CardHeader>
          <CardTitle className="text-base">Módulo Activo</CardTitle>
          <CardDescription>
            Activa o desactiva el módulo de gamificación para todo el tenant.
            Desactivar no borra datos, pero deja de calcular puntajes.
          </CardDescription>
        </CardHeader>
        <CardContent>
          <div className="flex items-center gap-3">
            <Switch
              checked={config.moduloActivo ?? false}
              onCheckedChange={(v) => updateField("moduloActivo", v)}
            />
            <Label className="text-sm">
              {config.moduloActivo ? "Activo" : "Desactivado"}
            </Label>
          </div>
        </CardContent>
      </Card>

      {/* Pesos por Dimensión */}
      <Card>
        <CardHeader>
          <CardTitle className="text-base">Pesos por Dimensión</CardTitle>
          <CardDescription>
            Define el peso relativo de cada dimensión en el Trust Score. Los pesos
            deben sumar 100%.
          </CardDescription>
        </CardHeader>
        <CardContent className="space-y-4">
          <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
            {MAIN_DIMENSIONS.map(([key, dim]) => (
              <div key={key} className="flex items-center gap-3">
                <span
                  className={`h-3 w-3 shrink-0 rounded-full ${dim.bgColor}`}
                />
                <Label className="min-w-[110px] text-sm">{dim.label}</Label>
                <Input
                  type="number"
                  min={0}
                  max={100}
                  className="w-20"
                  value={config[PESO_FIELDS[key]] ?? 0}
                  onChange={(e) =>
                    updateField(PESO_FIELDS[key], parseInt(e.target.value) || 0)
                  }
                />
                <span className="text-xs text-muted-foreground">%</span>
              </div>
            ))}
          </div>
          <p
            className={`text-xs ${
              pesoSum === 100 ? "text-muted-foreground" : "text-red-400 font-medium"
            }`}
          >
            Total: {pesoSum}% {pesoSum !== 100 && "(debe sumar 100%)"}
          </p>
        </CardContent>
      </Card>

      {/* Parámetros Generales */}
      <Card>
        <CardHeader>
          <CardTitle className="text-base">Parámetros Generales</CardTitle>
        </CardHeader>
        <CardContent className="space-y-4">
          <div className="grid gap-4 sm:grid-cols-2">
            <div className="space-y-1.5">
              <Label className="text-sm">Tasa conversión (puntos por CLP)</Label>
              <Input
                type="number"
                min={0}
                value={config.puntosPorClp ?? 10}
                onChange={(e) =>
                  updateField("puntosPorClp", parseFloat(e.target.value) || 0)
                }
              />
            </div>
            <div className="space-y-1.5">
              <Label className="text-sm">Máx. puntos diarios</Label>
              <Input
                type="number"
                min={0}
                value={config.maxPuntosDiarios ?? 200}
                onChange={(e) =>
                  updateField("maxPuntosDiarios", parseInt(e.target.value) || 0)
                }
              />
            </div>
            <div className="space-y-1.5">
              <Label className="text-sm">Expiración puntos (meses)</Label>
              <Input
                type="number"
                min={1}
                value={config.expiracionPuntosMeses ?? 12}
                onChange={(e) =>
                  updateField(
                    "expiracionPuntosMeses",
                    parseInt(e.target.value) || 1
                  )
                }
              />
            </div>
            <div className="space-y-1.5">
              <Label className="text-sm">Día reset ranking</Label>
              <Input
                type="text"
                value={config.rankingResetDia ?? "lunes"}
                onChange={(e) => updateField("rankingResetDia", e.target.value)}
              />
            </div>
          </div>
          <div className="flex items-center gap-3 pt-2">
            <Switch
              checked={config.bonosHabilitados ?? false}
              onCheckedChange={(v) => updateField("bonosHabilitados", v)}
            />
            <Label className="text-sm">Bonos habilitados</Label>
          </div>
        </CardContent>
      </Card>

      {/* Save button */}
      <div className="flex justify-end">
        <Button onClick={handleSave} disabled={saving}>
          <Save className="mr-2 h-4 w-4" />
          {saving ? "Guardando..." : "Guardar configuración"}
        </Button>
      </div>
    </div>
  );
}
