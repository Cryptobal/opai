"use client";

import { useState, useEffect } from "react";
import { toast } from "sonner";
import { Loader2, Save } from "lucide-react";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Switch } from "@/components/ui/switch";
import type { AlertaCoberturaConfig as ConfigType } from "@/components/ops/alertas-cobertura/types";

export function AlertasCoberturaConfig() {
  const [config, setConfig] = useState<ConfigType | null>(null);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);

  useEffect(() => {
    fetch("/api/ops/alertas-cobertura/config")
      .then((r) => r.json())
      .then((json) => {
        if (json.success) setConfig(json.data);
        setLoading(false);
      })
      .catch(() => {
        toast.error("Error cargando configuración");
        setLoading(false);
      });
  }, []);

  const handleSave = async () => {
    if (!config) return;
    setSaving(true);
    try {
      const res = await fetch("/api/ops/alertas-cobertura/config", {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(config),
      });
      const json = await res.json();
      if (json.success) {
        setConfig(json.data);
        toast.success("Configuración guardada");
      } else {
        toast.error(json.error || "Error al guardar");
      }
    } catch {
      toast.error("Error al guardar configuración");
    } finally {
      setSaving(false);
    }
  };

  const update = (key: keyof ConfigType, value: unknown) => {
    if (!config) return;
    setConfig({ ...config, [key]: value });
  };

  const toggleChannel = (field: "canalInternoDefault" | "canalExternoDefault", channel: string) => {
    if (!config) return;
    const arr = config[field];
    const next = arr.includes(channel)
      ? arr.filter((c) => c !== channel)
      : [...arr, channel];
    update(field, next);
  };

  if (loading) {
    return (
      <div className="flex items-center justify-center py-12">
        <Loader2 className="h-6 w-6 animate-spin text-muted-foreground" />
      </div>
    );
  }

  if (!config) return null;

  return (
    <div className="space-y-6 max-w-2xl">
      {/* Estado del módulo */}
      <Card>
        <CardContent className="p-4">
          <div className="flex items-center justify-between">
            <div>
              <p className="text-sm font-medium">Estado del módulo</p>
              <p className="text-xs text-muted-foreground">
                {config.habilitado ? "El módulo está activo" : "El módulo está desactivado"}
              </p>
            </div>
            <Switch
              checked={config.habilitado}
              onCheckedChange={(v) => update("habilitado", v)}
            />
          </div>
        </CardContent>
      </Card>

      {/* Oleadas */}
      <Card>
        <CardHeader className="pb-2">
          <CardTitle className="text-sm">Oleadas</CardTitle>
        </CardHeader>
        <CardContent className="space-y-4">
          {/* Oleada 0 */}
          <div className="flex items-center justify-between gap-4">
            <div className="flex-1">
              <p className="text-sm font-medium">Oleada 0 — Turno Saliente</p>
              <div className="flex items-center gap-2 mt-1">
                <Switch
                  checked={config.incluirTurnoSaliente}
                  onCheckedChange={(v) => update("incluirTurnoSaliente", v)}
                />
                <span className="text-xs text-muted-foreground">Incluir turno saliente</span>
              </div>
            </div>
            <div className="w-24">
              <Label className="text-[10px]">Espera (min)</Label>
              <Input
                type="number"
                min={1}
                max={60}
                value={config.oleada0EsperaMin}
                onChange={(e) => update("oleada0EsperaMin", Number(e.target.value))}
                className="h-8"
              />
            </div>
          </div>

          <div className="h-px bg-border" />

          {/* Oleada 1 */}
          <div className="flex items-center justify-between gap-4">
            <div className="flex-1">
              <p className="text-sm font-medium">Oleada 1 — Cercanos</p>
            </div>
            <div className="flex gap-2">
              <div className="w-20">
                <Label className="text-[10px]">Radio (km)</Label>
                <Input
                  type="number"
                  min={1}
                  max={50}
                  value={config.oleada1RadioKm}
                  onChange={(e) => update("oleada1RadioKm", Number(e.target.value))}
                  className="h-8"
                />
              </div>
              <div className="w-20">
                <Label className="text-[10px]">Espera (min)</Label>
                <Input
                  type="number"
                  min={1}
                  max={60}
                  value={config.oleada1EsperaMin}
                  onChange={(e) => update("oleada1EsperaMin", Number(e.target.value))}
                  className="h-8"
                />
              </div>
            </div>
          </div>

          {/* Oleada 2 */}
          <div className="flex items-center justify-between gap-4">
            <div className="flex-1">
              <p className="text-sm font-medium">Oleada 2 — Medianos</p>
            </div>
            <div className="flex gap-2">
              <div className="w-20">
                <Label className="text-[10px]">Radio (km)</Label>
                <Input
                  type="number"
                  min={1}
                  max={100}
                  value={config.oleada2RadioKm}
                  onChange={(e) => update("oleada2RadioKm", Number(e.target.value))}
                  className="h-8"
                />
              </div>
              <div className="w-20">
                <Label className="text-[10px]">Espera (min)</Label>
                <Input
                  type="number"
                  min={1}
                  max={60}
                  value={config.oleada2EsperaMin}
                  onChange={(e) => update("oleada2EsperaMin", Number(e.target.value))}
                  className="h-8"
                />
              </div>
            </div>
          </div>

          {/* Oleada 3 */}
          <div className="flex items-center justify-between gap-4">
            <div className="flex-1">
              <p className="text-sm font-medium">Oleada 3 — Lejanos</p>
            </div>
            <div className="flex gap-2">
              <div className="w-20">
                <Label className="text-[10px]">Radio (km)</Label>
                <Input
                  type="number"
                  min={1}
                  max={200}
                  value={config.oleada3RadioKm}
                  onChange={(e) => update("oleada3RadioKm", Number(e.target.value))}
                  className="h-8"
                />
              </div>
              <div className="w-20">
                <Label className="text-[10px]">Espera (min)</Label>
                <Input
                  type="number"
                  min={1}
                  max={60}
                  value={config.oleada3EsperaMin}
                  onChange={(e) => update("oleada3EsperaMin", Number(e.target.value))}
                  className="h-8"
                />
              </div>
            </div>
          </div>

          {/* Oleada Externa */}
          <div className="flex items-center justify-between gap-4">
            <div className="flex-1">
              <p className="text-sm font-medium">Oleada Externa</p>
            </div>
            <div className="w-24">
              <Label className="text-[10px]">Espera (min)</Label>
              <Input
                type="number"
                min={1}
                max={120}
                value={config.oleadaExternaEsperaMin}
                onChange={(e) => update("oleadaExternaEsperaMin", Number(e.target.value))}
                className="h-8"
              />
            </div>
          </div>
        </CardContent>
      </Card>

      {/* General */}
      <Card>
        <CardHeader className="pb-2">
          <CardTitle className="text-sm">General</CardTitle>
        </CardHeader>
        <CardContent className="space-y-4">
          <div className="grid grid-cols-2 gap-4">
            <div className="space-y-1.5">
              <Label>TTL de alerta (horas)</Label>
              <Input
                type="number"
                min={1}
                max={48}
                value={config.alertaTtlHoras}
                onChange={(e) => update("alertaTtlHoras", Number(e.target.value))}
              />
            </div>
            <div className="space-y-1.5">
              <Label>Confirmación post-turno (min)</Label>
              <Input
                type="number"
                min={5}
                max={480}
                value={config.confirmacionDelayMin}
                onChange={(e) => update("confirmacionDelayMin", Number(e.target.value))}
              />
            </div>
          </div>
          <div className="space-y-1.5">
            <Label>Monto default CLP</Label>
            <Input
              type="number"
              min={0}
              step={1000}
              value={config.montoDefaultClp}
              onChange={(e) => update("montoDefaultClp", Number(e.target.value))}
            />
            <p className="text-[10px] text-muted-foreground">0 = usar monto de la instalación</p>
          </div>
        </CardContent>
      </Card>

      {/* Features */}
      <Card>
        <CardHeader className="pb-2">
          <CardTitle className="text-sm">Features</CardTitle>
        </CardHeader>
        <CardContent className="space-y-3">
          <div className="flex items-center justify-between">
            <Label className="text-sm">Auto-asignar en pauta al confirmar</Label>
            <Switch
              checked={config.autoAsignarPauta}
              onCheckedChange={(v) => update("autoAsignarPauta", v)}
            />
          </div>
          <div className="flex items-center justify-between">
            <Label className="text-sm">Notificar en chat de instalación</Label>
            <Switch
              checked={config.notificarChatInterno}
              onCheckedChange={(v) => update("notificarChatInterno", v)}
            />
          </div>
        </CardContent>
      </Card>

      {/* Canales de notificación */}
      <Card>
        <CardHeader className="pb-2">
          <CardTitle className="text-sm">Canales de notificación</CardTitle>
        </CardHeader>
        <CardContent className="space-y-4">
          <div className="space-y-2">
            <p className="text-xs font-medium text-muted-foreground">Internos</p>
            <div className="flex gap-4">
              {["PUSH", "EMAIL", "WHATSAPP"].map((ch) => (
                <div key={ch} className="flex items-center gap-2">
                  <Switch
                    checked={config.canalInternoDefault.includes(ch)}
                    onCheckedChange={() => toggleChannel("canalInternoDefault", ch)}
                  />
                  <span className="text-xs">{ch}</span>
                </div>
              ))}
            </div>
          </div>
          <div className="space-y-2">
            <p className="text-xs font-medium text-muted-foreground">Externos</p>
            <div className="flex gap-4">
              {["PUSH", "EMAIL", "WHATSAPP"].map((ch) => (
                <div key={ch} className="flex items-center gap-2">
                  <Switch
                    checked={config.canalExternoDefault.includes(ch)}
                    onCheckedChange={() => toggleChannel("canalExternoDefault", ch)}
                  />
                  <span className="text-xs">{ch}</span>
                </div>
              ))}
            </div>
          </div>
        </CardContent>
      </Card>

      {/* Save */}
      <div className="flex justify-end pb-8">
        <Button onClick={handleSave} disabled={saving}>
          {saving ? (
            <Loader2 className="h-4 w-4 animate-spin mr-1.5" />
          ) : (
            <Save className="h-4 w-4 mr-1.5" />
          )}
          Guardar Configuración
        </Button>
      </div>
    </div>
  );
}
