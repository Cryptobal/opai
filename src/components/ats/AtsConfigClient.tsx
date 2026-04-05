"use client";

import { useState } from "react";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { Label } from "@/components/ui/label";
import { Slider } from "@/components/ui/slider";
import { Switch } from "@/components/ui/switch";
import { Input } from "@/components/ui/input";
import { Badge } from "@/components/ui/badge";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { toast } from "sonner";
import { Eye, EyeOff } from "lucide-react";

interface AtsChannelCfg {
  enabled: boolean;
  label: string;
  tipo: "api" | "feed" | "manual" | "builtin";
  apiKey?: string;
  apiSecret?: string;
  employerId?: string;
  feedUrl?: string;
  notas?: string;
}

interface AtsConfig {
  pesoOS10: number;
  pesoDistancia: number;
  pesoDisponibilidad: number;
  pesoExperiencia: number;
  pesoRenta: number;
  pesoEvaluacion: number;
  radioMaxKm: number;
  habilitado: boolean;
  mostrarScoreAlGuardia: boolean;
  filtrosObligatorios: string[];
  notificarBaseInterna: boolean;
  canalesDefault: string[];
  autoPublicarAlActivar: boolean;
  expiracionDias: number;
  channelConfigs: Record<string, AtsChannelCfg>;
}

const PESO_FIELDS = [
  { key: "pesoOS10", label: "OS10 vigente" },
  { key: "pesoDistancia", label: "Distancia geográfica" },
  { key: "pesoDisponibilidad", label: "Disponibilidad de turno" },
  { key: "pesoExperiencia", label: "Experiencia" },
  { key: "pesoRenta", label: "Pretensión de renta" },
  { key: "pesoEvaluacion", label: "Evaluación interna" },
] as const;

const TIPO_BADGE_VARIANT: Record<string, "default" | "secondary" | "outline"> = {
  api: "default",
  feed: "secondary",
  manual: "outline",
  builtin: "secondary",
};

const TIPO_LABELS: Record<string, string> = {
  api: "API",
  feed: "Feed",
  manual: "Manual",
  builtin: "Builtin",
};

export function AtsConfigClient({ initialConfig }: { initialConfig: AtsConfig }) {
  const [config, setConfig] = useState<AtsConfig>(initialConfig);
  const [channels, setChannels] = useState<Record<string, AtsChannelCfg>>(
    initialConfig.channelConfigs ?? {},
  );
  const [saving, setSaving] = useState(false);
  const [savingChannels, setSavingChannels] = useState(false);
  const [visibleSecrets, setVisibleSecrets] = useState<Record<string, boolean>>({});

  const pesoTotal =
    config.pesoOS10 +
    config.pesoDistancia +
    config.pesoDisponibilidad +
    config.pesoExperiencia +
    config.pesoRenta +
    config.pesoEvaluacion;

  function updatePeso(key: keyof AtsConfig, value: number) {
    setConfig((c) => ({ ...c, [key]: value }));
  }

  function updateChannel(channelKey: string, updates: Partial<AtsChannelCfg>) {
    setChannels((prev) => ({
      ...prev,
      [channelKey]: { ...prev[channelKey], ...updates },
    }));
  }

  function toggleSecretVisibility(fieldId: string) {
    setVisibleSecrets((prev) => ({ ...prev, [fieldId]: !prev[fieldId] }));
  }

  async function save() {
    if (pesoTotal !== 100) {
      toast.error(`Los pesos deben sumar 100 (actual: ${pesoTotal})`);
      return;
    }
    setSaving(true);
    try {
      // eslint-disable-next-line @typescript-eslint/no-unused-vars
      const { channelConfigs: _, ...matchConfig } = config;
      const res = await fetch("/api/ops/ats/config", {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(matchConfig),
      });
      const json = await res.json();
      if (!json.success) {
        toast.error(json.error);
        return;
      }
      toast.success("Configuracion guardada");
    } catch {
      toast.error("Error de red");
    } finally {
      setSaving(false);
    }
  }

  async function saveChannels() {
    setSavingChannels(true);
    try {
      const res = await fetch("/api/ops/ats/channels", {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(channels),
      });
      const json = await res.json();
      if (!json.success) {
        toast.error(json.error);
        return;
      }
      toast.success("Canales guardados");
    } catch {
      toast.error("Error de red");
    } finally {
      setSavingChannels(false);
    }
  }

  return (
    <Tabs defaultValue="match" className="max-w-2xl">
      <TabsList>
        <TabsTrigger value="match">Match Score</TabsTrigger>
        <TabsTrigger value="canales">Canales</TabsTrigger>
      </TabsList>

      <TabsContent value="match" className="space-y-6 mt-4">
        {/* Match Score Weights */}
        <Card className="p-6 space-y-5">
          <div className="flex items-center justify-between">
            <h3 className="font-semibold">Pesos del Match Score</h3>
            <Badge variant={pesoTotal === 100 ? "default" : "destructive"}>
              Total: {pesoTotal}/100
            </Badge>
          </div>

          {PESO_FIELDS.map((field) => {
            const value = config[field.key] as number;
            return (
              <div key={field.key} className="space-y-1">
                <div className="flex items-center justify-between">
                  <Label className="text-sm">{field.label}</Label>
                  <span className="text-sm font-medium w-8 text-right">{value}</span>
                </div>
                <Slider
                  value={[value]}
                  min={0}
                  max={100}
                  step={5}
                  onValueChange={([v]) => updatePeso(field.key, v)}
                />
              </div>
            );
          })}
        </Card>

        {/* Feature flags */}
        <Card className="p-6 space-y-4">
          <h3 className="font-semibold">Opciones</h3>

          <div className="flex items-center justify-between">
            <div>
              <Label>Modulo habilitado</Label>
              <p className="text-xs text-muted-foreground">Activa o desactiva el modulo ATS completo</p>
            </div>
            <Switch
              checked={config.habilitado}
              onCheckedChange={(v) => setConfig((c) => ({ ...c, habilitado: v }))}
            />
          </div>

          <div className="flex items-center justify-between">
            <div>
              <Label>Mostrar score al guardia</Label>
              <p className="text-xs text-muted-foreground">El guardia ve su % de match en el portal</p>
            </div>
            <Switch
              checked={config.mostrarScoreAlGuardia}
              onCheckedChange={(v) => setConfig((c) => ({ ...c, mostrarScoreAlGuardia: v }))}
            />
          </div>

          <div className="flex items-center justify-between">
            <div>
              <Label>Notificar base interna al publicar</Label>
              <p className="text-xs text-muted-foreground">Push a guardias con match alto</p>
            </div>
            <Switch
              checked={config.notificarBaseInterna}
              onCheckedChange={(v) => setConfig((c) => ({ ...c, notificarBaseInterna: v }))}
            />
          </div>

          <div className="flex items-center justify-between">
            <div>
              <Label>Auto-publicar al activar aviso</Label>
              <p className="text-xs text-muted-foreground">Publica automaticamente en canales seleccionados</p>
            </div>
            <Switch
              checked={config.autoPublicarAlActivar}
              onCheckedChange={(v) => setConfig((c) => ({ ...c, autoPublicarAlActivar: v }))}
            />
          </div>
        </Card>

        {/* Geography & expiration */}
        <Card className="p-6 space-y-4">
          <h3 className="font-semibold">Distribucion</h3>

          <div className="grid grid-cols-2 gap-4">
            <div>
              <Label>Radio maximo (km)</Label>
              <Input
                type="number"
                min={1}
                max={500}
                value={config.radioMaxKm}
                onChange={(e) => setConfig((c) => ({ ...c, radioMaxKm: parseInt(e.target.value) || 30 }))}
              />
            </div>
            <div>
              <Label>Dias de expiracion</Label>
              <Input
                type="number"
                min={1}
                max={365}
                value={config.expiracionDias}
                onChange={(e) => setConfig((c) => ({ ...c, expiracionDias: parseInt(e.target.value) || 30 }))}
              />
            </div>
          </div>
        </Card>

        <Button onClick={save} disabled={saving || pesoTotal !== 100}>
          Guardar configuracion
        </Button>
      </TabsContent>

      <TabsContent value="canales" className="space-y-6 mt-4">
        {Object.entries(channels).map(([key, ch]) => (
          <Card key={key} className="p-6 space-y-4">
            <div className="flex items-center justify-between">
              <div className="flex items-center gap-3">
                <h3 className="font-semibold">{ch.label}</h3>
                <Badge variant={TIPO_BADGE_VARIANT[ch.tipo] ?? "outline"}>
                  {TIPO_LABELS[ch.tipo] ?? ch.tipo}
                </Badge>
              </div>
              <Switch
                checked={ch.enabled}
                onCheckedChange={(v) => updateChannel(key, { enabled: v })}
              />
            </div>

            {ch.tipo === "api" && ch.enabled && (
              <div className="space-y-3 pl-1">
                {ch.apiKey !== undefined && (
                  <div className="space-y-1">
                    <Label className="text-sm">API Key</Label>
                    <div className="relative">
                      <Input
                        type={visibleSecrets[`${key}.apiKey`] ? "text" : "password"}
                        value={ch.apiKey ?? ""}
                        onChange={(e) => updateChannel(key, { apiKey: e.target.value })}
                        placeholder="Ingresa API Key"
                      />
                      <button
                        type="button"
                        className="absolute right-2 top-1/2 -translate-y-1/2 text-muted-foreground hover:text-foreground"
                        onClick={() => toggleSecretVisibility(`${key}.apiKey`)}
                      >
                        {visibleSecrets[`${key}.apiKey`] ? (
                          <EyeOff className="h-4 w-4" />
                        ) : (
                          <Eye className="h-4 w-4" />
                        )}
                      </button>
                    </div>
                  </div>
                )}
                {ch.apiSecret !== undefined && (
                  <div className="space-y-1">
                    <Label className="text-sm">API Secret</Label>
                    <div className="relative">
                      <Input
                        type={visibleSecrets[`${key}.apiSecret`] ? "text" : "password"}
                        value={ch.apiSecret ?? ""}
                        onChange={(e) => updateChannel(key, { apiSecret: e.target.value })}
                        placeholder="Ingresa API Secret"
                      />
                      <button
                        type="button"
                        className="absolute right-2 top-1/2 -translate-y-1/2 text-muted-foreground hover:text-foreground"
                        onClick={() => toggleSecretVisibility(`${key}.apiSecret`)}
                      >
                        {visibleSecrets[`${key}.apiSecret`] ? (
                          <EyeOff className="h-4 w-4" />
                        ) : (
                          <Eye className="h-4 w-4" />
                        )}
                      </button>
                    </div>
                  </div>
                )}
                {ch.employerId !== undefined && (
                  <div className="space-y-1">
                    <Label className="text-sm">Employer ID</Label>
                    <div className="relative">
                      <Input
                        type={visibleSecrets[`${key}.employerId`] ? "text" : "password"}
                        value={ch.employerId ?? ""}
                        onChange={(e) => updateChannel(key, { employerId: e.target.value })}
                        placeholder="Ingresa Employer ID"
                      />
                      <button
                        type="button"
                        className="absolute right-2 top-1/2 -translate-y-1/2 text-muted-foreground hover:text-foreground"
                        onClick={() => toggleSecretVisibility(`${key}.employerId`)}
                      >
                        {visibleSecrets[`${key}.employerId`] ? (
                          <EyeOff className="h-4 w-4" />
                        ) : (
                          <Eye className="h-4 w-4" />
                        )}
                      </button>
                    </div>
                  </div>
                )}
              </div>
            )}

            {ch.tipo === "feed" && ch.enabled && (
              <div className="space-y-1 pl-1">
                <Label className="text-sm">Feed URL</Label>
                <Input
                  type="url"
                  value={ch.feedUrl ?? ""}
                  onChange={(e) => updateChannel(key, { feedUrl: e.target.value })}
                  placeholder="https://..."
                />
              </div>
            )}

            {ch.tipo === "manual" && ch.enabled && (
              <div className="space-y-1 pl-1">
                <Label className="text-sm">Notas</Label>
                <textarea
                  className="w-full rounded-md border border-input bg-background px-3 py-2 text-sm ring-offset-background placeholder:text-muted-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
                  rows={3}
                  value={ch.notas ?? ""}
                  onChange={(e) => updateChannel(key, { notas: e.target.value })}
                  placeholder="Instrucciones o notas para publicacion manual..."
                />
              </div>
            )}
          </Card>
        ))}

        <Button onClick={saveChannels} disabled={savingChannels}>
          Guardar canales
        </Button>
      </TabsContent>
    </Tabs>
  );
}
