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
import { Eye, EyeOff, Info, ChevronDown, ChevronUp } from "lucide-react";

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
  feed: "Feed XML",
  manual: "Manual",
  builtin: "Automático",
};

const CHANNEL_SUBTITLE: Record<string, string> = {
  google_jobs: "Página pública indexable con datos estructurados",
  base_opai: "Notifica guardias con match alto en la plataforma",
  indeed: "Publica avisos via API de Indeed",
  computrabajo: "Publica avisos via API de Computrabajo",
  bumeran: "Publica avisos via API de Búmeran",
  talent: "Genera un feed XML que Talent.com consume",
  yapo: "Publicación manual con trazabilidad",
  laborum: "Publica avisos via API de Laborum",
  linkedin: "Publica avisos via LinkedIn Jobs API",
  bne: "Feed XML para la Bolsa Nacional de Empleo",
};

const CHANNEL_HELP: Record<string, string> = {
  google_jobs:
    "Automático. Al activar un aviso se genera una página pública con datos estructurados (JSON-LD) que Google indexa directamente. No requiere credenciales ni configuración adicional.",
  base_opai:
    "Automático. Notifica a los guardias registrados en OPAI que tienen match alto con el aviso. No requiere configuración adicional.",
  indeed:
    "Requiere cuenta de empleador en Indeed. Obtén tu API Key y Employer ID desde indeed.com/hiring → Integraciones → API. Ingresa ambos valores aquí.",
  computrabajo:
    "Requiere contrato activo con Computrabajo Chile. Solicita tus credenciales de API (Key + Secret) a tu ejecutivo de cuenta en Computrabajo.",
  bumeran:
    "Requiere contrato activo con Búmeran. Solicita tus credenciales de API (Key + Secret) a tu ejecutivo de cuenta en Búmeran.",
  talent:
    "Integración por Feed XML. OPAI genera automáticamente una URL con tus avisos activos en formato XML. Copia esa URL y regístrala en tu panel de Talent.com → Feed de empleos.",
  yapo:
    "Publicación manual. Al activar un aviso, OPAI lo marca como pendiente en Yapo para trazabilidad. Debes publicarlo manualmente en yapo.cl y anotar el enlace aquí.",
  laborum:
    "Requiere contrato activo con Laborum. Solicita tu API Key a tu ejecutivo de cuenta en Laborum e ingrésala aquí.",
  linkedin:
    "Requiere LinkedIn Recruiter o cuenta de empresa verificada. Crea una app en linkedin.com/talent → Integraciones e ingresa las credenciales (API Key + Secret) aquí.",
  bne:
    "Integración por Feed XML con la Bolsa Nacional de Empleo (bne.cl). OPAI genera una URL con tus avisos activos. Regístrala en tu panel BNE para sincronización automática.",
};

export function AtsConfigClient({ initialConfig }: { initialConfig: AtsConfig }) {
  const [config, setConfig] = useState<AtsConfig>(initialConfig);
  const [channels, setChannels] = useState<Record<string, AtsChannelCfg>>(
    initialConfig.channelConfigs ?? {},
  );
  const [saving, setSaving] = useState(false);
  const [savingChannels, setSavingChannels] = useState(false);
  const [visibleSecrets, setVisibleSecrets] = useState<Record<string, boolean>>({});
  const [expandedHelp, setExpandedHelp] = useState<Record<string, boolean>>({});

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

  function toggleHelp(key: string) {
    setExpandedHelp((prev) => ({ ...prev, [key]: !prev[key] }));
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
      toast.success("Configuración guardada");
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
    <Tabs defaultValue="match" className="w-full">
      <TabsList className="w-full grid grid-cols-2">
        <TabsTrigger value="match">Match Score</TabsTrigger>
        <TabsTrigger value="canales">Canales</TabsTrigger>
      </TabsList>

      <TabsContent value="match" className="space-y-4 mt-4">
        {/* Match Score Weights */}
        <Card className="p-4 sm:p-6 space-y-5">
          <div className="flex items-center justify-between gap-2">
            <h3 className="font-semibold text-sm sm:text-base">Pesos del Match Score</h3>
            <Badge variant={pesoTotal === 100 ? "default" : "destructive"}>
              {pesoTotal}/100
            </Badge>
          </div>

          {PESO_FIELDS.map((field) => {
            const value = config[field.key] as number;
            return (
              <div key={field.key} className="space-y-1.5">
                <div className="flex items-center justify-between">
                  <Label className="text-xs sm:text-sm">{field.label}</Label>
                  <span className="text-xs sm:text-sm font-medium tabular-nums w-8 text-right">{value}</span>
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
        <Card className="p-4 sm:p-6 space-y-4">
          <h3 className="font-semibold text-sm sm:text-base">Opciones</h3>

          <div className="flex items-center justify-between gap-3">
            <div className="min-w-0">
              <Label className="text-sm">Módulo habilitado</Label>
              <p className="text-xs text-muted-foreground">Activa o desactiva el ATS completo</p>
            </div>
            <Switch
              checked={config.habilitado}
              onCheckedChange={(v) => setConfig((c) => ({ ...c, habilitado: v }))}
            />
          </div>

          <div className="flex items-center justify-between gap-3">
            <div className="min-w-0">
              <Label className="text-sm">Mostrar score al guardia</Label>
              <p className="text-xs text-muted-foreground">El guardia ve su % de match en el portal</p>
            </div>
            <Switch
              checked={config.mostrarScoreAlGuardia}
              onCheckedChange={(v) => setConfig((c) => ({ ...c, mostrarScoreAlGuardia: v }))}
            />
          </div>

          <div className="flex items-center justify-between gap-3">
            <div className="min-w-0">
              <Label className="text-sm">Notificar base interna</Label>
              <p className="text-xs text-muted-foreground">Push a guardias con match alto al publicar</p>
            </div>
            <Switch
              checked={config.notificarBaseInterna}
              onCheckedChange={(v) => setConfig((c) => ({ ...c, notificarBaseInterna: v }))}
            />
          </div>

          <div className="flex items-center justify-between gap-3">
            <div className="min-w-0">
              <Label className="text-sm">Auto-publicar al activar</Label>
              <p className="text-xs text-muted-foreground">Publica en canales habilitados automáticamente</p>
            </div>
            <Switch
              checked={config.autoPublicarAlActivar}
              onCheckedChange={(v) => setConfig((c) => ({ ...c, autoPublicarAlActivar: v }))}
            />
          </div>
        </Card>

        {/* Geography & expiration */}
        <Card className="p-4 sm:p-6 space-y-4">
          <h3 className="font-semibold text-sm sm:text-base">Distribución</h3>
          <div className="grid grid-cols-2 gap-3">
            <div>
              <Label className="text-sm">Radio máximo (km)</Label>
              <Input
                type="number"
                min={1}
                max={500}
                value={config.radioMaxKm}
                onChange={(e) => setConfig((c) => ({ ...c, radioMaxKm: parseInt(e.target.value) || 30 }))}
              />
            </div>
            <div>
              <Label className="text-sm">Días de expiración</Label>
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

        <Button onClick={save} disabled={saving || pesoTotal !== 100} className="w-full sm:w-auto">
          Guardar configuración
        </Button>
      </TabsContent>

      <TabsContent value="canales" className="space-y-3 mt-4">
        {Object.entries(channels).map(([key, ch]) => (
          <Card key={key} className="p-4 sm:p-6 space-y-3">
            {/* Header row */}
            <div className="flex items-start justify-between gap-3">
              <div className="min-w-0 flex-1">
                <div className="flex items-center gap-2 flex-wrap">
                  <h3 className="font-semibold text-sm sm:text-base">{ch.label}</h3>
                  <Badge variant={TIPO_BADGE_VARIANT[ch.tipo] ?? "outline"} className="text-[10px] px-1.5 py-0">
                    {TIPO_LABELS[ch.tipo] ?? ch.tipo}
                  </Badge>
                </div>
                {CHANNEL_SUBTITLE[key] && (
                  <p className="text-xs text-muted-foreground mt-0.5">{CHANNEL_SUBTITLE[key]}</p>
                )}
              </div>
              <Switch
                checked={ch.enabled}
                onCheckedChange={(v) => updateChannel(key, { enabled: v })}
              />
            </div>

            {/* Expandable help — tap-friendly for mobile */}
            {CHANNEL_HELP[key] && (
              <button
                type="button"
                onClick={() => toggleHelp(key)}
                className="flex items-center gap-1.5 text-xs text-muted-foreground hover:text-foreground transition-colors w-full text-left"
              >
                <Info className="h-3.5 w-3.5 shrink-0" />
                <span>{expandedHelp[key] ? "Ocultar instrucciones" : "¿Cómo configurar este canal?"}</span>
                {expandedHelp[key] ? (
                  <ChevronUp className="h-3.5 w-3.5 shrink-0 ml-auto" />
                ) : (
                  <ChevronDown className="h-3.5 w-3.5 shrink-0 ml-auto" />
                )}
              </button>
            )}
            {expandedHelp[key] && CHANNEL_HELP[key] && (
              <div className="text-xs text-muted-foreground bg-muted/50 rounded-md p-3 leading-relaxed">
                {CHANNEL_HELP[key]}
              </div>
            )}

            {/* API credential fields */}
            {ch.tipo === "api" && ch.enabled && (
              <div className="space-y-3">
                {ch.apiKey !== undefined && (
                  <div className="space-y-1">
                    <Label className="text-xs sm:text-sm">API Key</Label>
                    <div className="relative">
                      <Input
                        type={visibleSecrets[`${key}.apiKey`] ? "text" : "password"}
                        value={ch.apiKey ?? ""}
                        onChange={(e) => updateChannel(key, { apiKey: e.target.value })}
                        placeholder="Ingresa API Key"
                        className="pr-10"
                      />
                      <button
                        type="button"
                        className="absolute right-2 top-1/2 -translate-y-1/2 text-muted-foreground hover:text-foreground p-1"
                        onClick={() => toggleSecretVisibility(`${key}.apiKey`)}
                      >
                        {visibleSecrets[`${key}.apiKey`] ? <EyeOff className="h-4 w-4" /> : <Eye className="h-4 w-4" />}
                      </button>
                    </div>
                  </div>
                )}
                {ch.apiSecret !== undefined && (
                  <div className="space-y-1">
                    <Label className="text-xs sm:text-sm">API Secret</Label>
                    <div className="relative">
                      <Input
                        type={visibleSecrets[`${key}.apiSecret`] ? "text" : "password"}
                        value={ch.apiSecret ?? ""}
                        onChange={(e) => updateChannel(key, { apiSecret: e.target.value })}
                        placeholder="Ingresa API Secret"
                        className="pr-10"
                      />
                      <button
                        type="button"
                        className="absolute right-2 top-1/2 -translate-y-1/2 text-muted-foreground hover:text-foreground p-1"
                        onClick={() => toggleSecretVisibility(`${key}.apiSecret`)}
                      >
                        {visibleSecrets[`${key}.apiSecret`] ? <EyeOff className="h-4 w-4" /> : <Eye className="h-4 w-4" />}
                      </button>
                    </div>
                  </div>
                )}
                {ch.employerId !== undefined && (
                  <div className="space-y-1">
                    <Label className="text-xs sm:text-sm">Employer ID</Label>
                    <div className="relative">
                      <Input
                        type={visibleSecrets[`${key}.employerId`] ? "text" : "password"}
                        value={ch.employerId ?? ""}
                        onChange={(e) => updateChannel(key, { employerId: e.target.value })}
                        placeholder="Ingresa Employer ID"
                        className="pr-10"
                      />
                      <button
                        type="button"
                        className="absolute right-2 top-1/2 -translate-y-1/2 text-muted-foreground hover:text-foreground p-1"
                        onClick={() => toggleSecretVisibility(`${key}.employerId`)}
                      >
                        {visibleSecrets[`${key}.employerId`] ? <EyeOff className="h-4 w-4" /> : <Eye className="h-4 w-4" />}
                      </button>
                    </div>
                  </div>
                )}
              </div>
            )}

            {/* Feed URL field */}
            {ch.tipo === "feed" && ch.enabled && (
              <div className="space-y-1">
                <Label className="text-xs sm:text-sm">Feed URL</Label>
                <Input
                  type="url"
                  value={ch.feedUrl ?? ""}
                  onChange={(e) => updateChannel(key, { feedUrl: e.target.value })}
                  placeholder="https://..."
                />
              </div>
            )}

            {/* Manual notes */}
            {ch.tipo === "manual" && ch.enabled && (
              <div className="space-y-1">
                <Label className="text-xs sm:text-sm">Notas</Label>
                <textarea
                  className="w-full rounded-md border border-input bg-background px-3 py-2 text-sm ring-offset-background placeholder:text-muted-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring min-h-[72px]"
                  rows={3}
                  value={ch.notas ?? ""}
                  onChange={(e) => updateChannel(key, { notas: e.target.value })}
                  placeholder="Instrucciones o notas para publicación manual..."
                />
              </div>
            )}
          </Card>
        ))}

        <Button onClick={saveChannels} disabled={savingChannels} className="w-full sm:w-auto">
          Guardar canales
        </Button>
      </TabsContent>
    </Tabs>
  );
}
