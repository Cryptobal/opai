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
import {
  Copy,
  ExternalLink,
  Lock,
  Zap,
  Rss,
  MousePointerClick,
} from "lucide-react";

interface AtsChannelCfg {
  enabled: boolean;
  label: string;
  tipo: "automatico" | "feed" | "manual_link" | "partner_api";
  externalUrl?: string;
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
  { key: "pesoDistancia", label: "Distancia geografica" },
  { key: "pesoDisponibilidad", label: "Disponibilidad de turno" },
  { key: "pesoExperiencia", label: "Experiencia" },
  { key: "pesoRenta", label: "Pretension de renta" },
  { key: "pesoEvaluacion", label: "Evaluacion interna" },
] as const;

const TIPO_BADGE_VARIANT: Record<string, "default" | "secondary" | "outline"> =
  {
    automatico: "secondary",
    feed: "default",
    manual_link: "outline",
    partner_api: "outline",
  };

const TIPO_LABELS: Record<string, string> = {
  automatico: "Automatico",
  feed: "Feed XML",
  manual_link: "Manual",
  partner_api: "Proximamente",
};

const TIPO_ICONS: Record<string, typeof Zap> = {
  automatico: Zap,
  feed: Rss,
  manual_link: MousePointerClick,
  partner_api: Lock,
};

const CHANNEL_DESCRIPTIONS: Record<string, string> = {
  google_jobs:
    "Se genera automaticamente una pagina publica con JSON-LD que Google indexa.",
  base_opai: "Notifica automaticamente a guardias con match alto.",
  talent: "Genera un feed XML con tus avisos activos para Talent.com.",
  bne: "Genera un feed XML con tus avisos activos para la Bolsa Nacional de Empleo.",
  indeed: "Publica el aviso manualmente en Indeed y pega el enlace aqui.",
  computrabajo:
    "Publica el aviso manualmente en Computrabajo y pega el enlace aqui.",
  bumeran: "Publica el aviso manualmente en Bumeran y pega el enlace aqui.",
  laborum: "Publica el aviso manualmente en Laborum y pega el enlace aqui.",
  linkedin:
    "Publica el aviso manualmente en LinkedIn Jobs y pega el enlace aqui.",
  yapo: "Publica el aviso manualmente en Yapo y pega el enlace aqui.",
};

const FEED_INSTRUCTIONS: Record<string, string[]> = {
  talent: [
    "Copia la URL de arriba",
    "Ve a talent.com -> Panel de empleador -> Integracion de feeds",
    "Pega la URL y guarda",
  ],
  bne: [
    "Copia la URL de arriba",
    "Ve a bne.cl -> Panel de empleador -> Integracion XML",
    "Pega la URL y guarda",
  ],
};

const MANUAL_LINK_PORTALS: Record<string, { url: string; label: string }> = {
  indeed: { url: "https://indeed.com/hiring", label: "Ir a Indeed" },
  computrabajo: {
    url: "https://www.computrabajo.cl",
    label: "Ir a Computrabajo",
  },
  bumeran: { url: "https://www.bumeran.com", label: "Ir a Bumeran" },
  laborum: { url: "https://www.laborum.com", label: "Ir a Laborum" },
  linkedin: {
    url: "https://www.linkedin.com/talent",
    label: "Ir a LinkedIn",
  },
  yapo: { url: "https://www.yapo.cl", label: "Ir a Yapo" },
};

export function AtsConfigClient({
  initialConfig,
  tenantSlug,
}: {
  initialConfig: AtsConfig;
  tenantSlug: string;
}) {
  const [config, setConfig] = useState<AtsConfig>(initialConfig);
  const [channels, setChannels] = useState<Record<string, AtsChannelCfg>>(
    initialConfig.channelConfigs ?? {},
  );
  const [saving, setSaving] = useState(false);
  const [savingChannels, setSavingChannels] = useState(false);

  const siteUrl =
    typeof window !== "undefined"
      ? window.location.origin
      : "https://opai.cl";
  const feedUrl = `${siteUrl}/api/public/${tenantSlug}/ats/feed.xml`;

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

  async function copyToClipboard(text: string) {
    try {
      await navigator.clipboard.writeText(text);
      toast.success("URL copiada al portapapeles");
    } catch {
      toast.error("No se pudo copiar");
    }
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

  function renderAutomaticoCard(key: string, ch: AtsChannelCfg) {
    return (
      <Card key={key} className="p-4 sm:p-6 space-y-2">
        <div className="flex items-start justify-between gap-3">
          <div className="min-w-0 flex-1">
            <div className="flex items-center gap-2 flex-wrap">
              <h3 className="font-semibold text-sm sm:text-base">
                {ch.label}
              </h3>
              <Badge
                variant={TIPO_BADGE_VARIANT[ch.tipo]}
                className="text-[10px] px-1.5 py-0"
              >
                {TIPO_LABELS[ch.tipo]}
              </Badge>
            </div>
            <p className="text-xs text-muted-foreground mt-0.5">
              {CHANNEL_DESCRIPTIONS[key]}
            </p>
          </div>
          <Switch
            checked={ch.enabled}
            onCheckedChange={(v) => updateChannel(key, { enabled: v })}
          />
        </div>
        <p className="text-xs text-muted-foreground italic">
          No requiere configuracion.
        </p>
      </Card>
    );
  }

  function renderFeedCard(key: string, ch: AtsChannelCfg) {
    const instructions = FEED_INSTRUCTIONS[key] ?? [];
    return (
      <Card key={key} className="p-4 sm:p-6 space-y-3">
        <div className="flex items-start justify-between gap-3">
          <div className="min-w-0 flex-1">
            <div className="flex items-center gap-2 flex-wrap">
              <h3 className="font-semibold text-sm sm:text-base">
                {ch.label}
              </h3>
              <Badge
                variant={TIPO_BADGE_VARIANT[ch.tipo]}
                className="text-[10px] px-1.5 py-0"
              >
                {TIPO_LABELS[ch.tipo]}
              </Badge>
            </div>
            <p className="text-xs text-muted-foreground mt-0.5">
              {CHANNEL_DESCRIPTIONS[key]}
            </p>
          </div>
          <Switch
            checked={ch.enabled}
            onCheckedChange={(v) => updateChannel(key, { enabled: v })}
          />
        </div>

        {ch.enabled && (
          <div className="space-y-3">
            <div className="space-y-1.5">
              <Label className="text-xs sm:text-sm">Feed URL</Label>
              <div className="flex gap-2">
                <Input
                  readOnly
                  value={feedUrl}
                  className="text-xs font-mono bg-muted/50"
                  onClick={(e) => (e.target as HTMLInputElement).select()}
                />
                <Button
                  type="button"
                  variant="outline"
                  size="sm"
                  className="shrink-0"
                  onClick={() => copyToClipboard(feedUrl)}
                >
                  <Copy className="h-4 w-4 mr-1" />
                  Copiar
                </Button>
              </div>
            </div>

            {instructions.length > 0 && (
              <div className="text-xs text-muted-foreground bg-muted/50 rounded-md p-3 space-y-1">
                <p className="font-medium text-foreground">Instrucciones:</p>
                <ol className="list-decimal list-inside space-y-0.5">
                  {instructions.map((step, i) => (
                    <li key={i}>{step}</li>
                  ))}
                </ol>
              </div>
            )}
          </div>
        )}
      </Card>
    );
  }

  function renderManualLinkCard(key: string, ch: AtsChannelCfg) {
    const portal = MANUAL_LINK_PORTALS[key];
    return (
      <Card key={key} className="p-4 sm:p-6 space-y-3">
        <div className="flex items-start justify-between gap-3">
          <div className="min-w-0 flex-1">
            <div className="flex items-center gap-2 flex-wrap">
              <h3 className="font-semibold text-sm sm:text-base">
                {ch.label}
              </h3>
              <Badge
                variant={TIPO_BADGE_VARIANT[ch.tipo]}
                className="text-[10px] px-1.5 py-0"
              >
                {TIPO_LABELS[ch.tipo]}
              </Badge>
            </div>
            <p className="text-xs text-muted-foreground mt-0.5">
              {CHANNEL_DESCRIPTIONS[key]}
            </p>
          </div>
          <Switch
            checked={ch.enabled}
            onCheckedChange={(v) => updateChannel(key, { enabled: v })}
          />
        </div>

        {ch.enabled && (
          <div className="space-y-3">
            {portal && (
              <a
                href={portal.url}
                target="_blank"
                rel="noopener noreferrer"
                className="inline-flex items-center gap-1.5 text-sm text-primary hover:underline font-medium"
              >
                {portal.label}
                <ExternalLink className="h-3.5 w-3.5" />
              </a>
            )}

            <div className="space-y-1.5">
              <Label className="text-xs sm:text-sm">
                URL del aviso publicado{" "}
                <span className="text-muted-foreground">(opcional, para trazabilidad)</span>
              </Label>
              <Input
                type="url"
                value={ch.externalUrl ?? ""}
                onChange={(e) =>
                  updateChannel(key, { externalUrl: e.target.value })
                }
                placeholder="https://..."
                className="text-sm"
              />
            </div>
          </div>
        )}
      </Card>
    );
  }

  function renderPartnerApiCard(key: string, ch: AtsChannelCfg) {
    return (
      <Card
        key={key}
        className="p-4 sm:p-6 space-y-2 opacity-60"
      >
        <div className="flex items-start justify-between gap-3">
          <div className="min-w-0 flex-1">
            <div className="flex items-center gap-2 flex-wrap">
              <h3 className="font-semibold text-sm sm:text-base">
                {ch.label}
              </h3>
              <Badge variant="outline" className="text-[10px] px-1.5 py-0">
                <Lock className="h-3 w-3 mr-0.5" />
                Proximamente
              </Badge>
            </div>
            <p className="text-xs text-muted-foreground mt-0.5">
              Disponible cuando OPAI se certifique como partner de {ch.label}.
              Por ahora, publica manualmente.
            </p>
          </div>
        </div>
      </Card>
    );
  }

  function renderChannelCard(key: string, ch: AtsChannelCfg) {
    const Icon = TIPO_ICONS[ch.tipo] ?? Zap;
    // We use the Icon in the badge area implicitly via the tipo
    void Icon;

    switch (ch.tipo) {
      case "automatico":
        return renderAutomaticoCard(key, ch);
      case "feed":
        return renderFeedCard(key, ch);
      case "manual_link":
        return renderManualLinkCard(key, ch);
      case "partner_api":
        return renderPartnerApiCard(key, ch);
      default:
        return renderManualLinkCard(key, ch);
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
            <h3 className="font-semibold text-sm sm:text-base">
              Pesos del Match Score
            </h3>
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
                  <span className="text-xs sm:text-sm font-medium tabular-nums w-8 text-right">
                    {value}
                  </span>
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
              <Label className="text-sm">Modulo habilitado</Label>
              <p className="text-xs text-muted-foreground">
                Activa o desactiva el ATS completo
              </p>
            </div>
            <Switch
              checked={config.habilitado}
              onCheckedChange={(v) =>
                setConfig((c) => ({ ...c, habilitado: v }))
              }
            />
          </div>

          <div className="flex items-center justify-between gap-3">
            <div className="min-w-0">
              <Label className="text-sm">Mostrar score al guardia</Label>
              <p className="text-xs text-muted-foreground">
                El guardia ve su % de match en el portal
              </p>
            </div>
            <Switch
              checked={config.mostrarScoreAlGuardia}
              onCheckedChange={(v) =>
                setConfig((c) => ({ ...c, mostrarScoreAlGuardia: v }))
              }
            />
          </div>

          <div className="flex items-center justify-between gap-3">
            <div className="min-w-0">
              <Label className="text-sm">Notificar base interna</Label>
              <p className="text-xs text-muted-foreground">
                Push a guardias con match alto al publicar
              </p>
            </div>
            <Switch
              checked={config.notificarBaseInterna}
              onCheckedChange={(v) =>
                setConfig((c) => ({ ...c, notificarBaseInterna: v }))
              }
            />
          </div>

          <div className="flex items-center justify-between gap-3">
            <div className="min-w-0">
              <Label className="text-sm">Auto-publicar al activar</Label>
              <p className="text-xs text-muted-foreground">
                Publica en canales habilitados automaticamente
              </p>
            </div>
            <Switch
              checked={config.autoPublicarAlActivar}
              onCheckedChange={(v) =>
                setConfig((c) => ({ ...c, autoPublicarAlActivar: v }))
              }
            />
          </div>
        </Card>

        {/* Geography & expiration */}
        <Card className="p-4 sm:p-6 space-y-4">
          <h3 className="font-semibold text-sm sm:text-base">Distribucion</h3>
          <div className="grid grid-cols-2 gap-3">
            <div>
              <Label className="text-sm">Radio maximo (km)</Label>
              <Input
                type="number"
                min={1}
                max={500}
                value={config.radioMaxKm}
                onChange={(e) =>
                  setConfig((c) => ({
                    ...c,
                    radioMaxKm: parseInt(e.target.value) || 30,
                  }))
                }
              />
            </div>
            <div>
              <Label className="text-sm">Dias de expiracion</Label>
              <Input
                type="number"
                min={1}
                max={365}
                value={config.expiracionDias}
                onChange={(e) =>
                  setConfig((c) => ({
                    ...c,
                    expiracionDias: parseInt(e.target.value) || 30,
                  }))
                }
              />
            </div>
          </div>
        </Card>

        <Button
          onClick={save}
          disabled={saving || pesoTotal !== 100}
          className="w-full sm:w-auto"
        >
          Guardar configuracion
        </Button>
      </TabsContent>

      <TabsContent value="canales" className="space-y-3 mt-4">
        {/* Section: Automatico */}
        <h4 className="text-xs font-semibold text-muted-foreground uppercase tracking-wider px-1">
          Automaticos
        </h4>
        {Object.entries(channels)
          .filter(([, ch]) => ch.tipo === "automatico")
          .map(([key, ch]) => renderChannelCard(key, ch))}

        {/* Section: Feed XML */}
        <h4 className="text-xs font-semibold text-muted-foreground uppercase tracking-wider px-1 pt-2">
          Feed XML
        </h4>
        {Object.entries(channels)
          .filter(([, ch]) => ch.tipo === "feed")
          .map(([key, ch]) => renderChannelCard(key, ch))}

        {/* Section: Manual */}
        <h4 className="text-xs font-semibold text-muted-foreground uppercase tracking-wider px-1 pt-2">
          Publicacion manual
        </h4>
        {Object.entries(channels)
          .filter(([, ch]) => ch.tipo === "manual_link")
          .map(([key, ch]) => renderChannelCard(key, ch))}

        {/* Section: Partner API (future) */}
        {Object.entries(channels).some(
          ([, ch]) => ch.tipo === "partner_api",
        ) && (
          <>
            <h4 className="text-xs font-semibold text-muted-foreground uppercase tracking-wider px-1 pt-2">
              Integraciones API (futuro)
            </h4>
            {Object.entries(channels)
              .filter(([, ch]) => ch.tipo === "partner_api")
              .map(([key, ch]) => renderChannelCard(key, ch))}
          </>
        )}

        <Button
          onClick={saveChannels}
          disabled={savingChannels}
          className="w-full sm:w-auto"
        >
          Guardar canales
        </Button>
      </TabsContent>
    </Tabs>
  );
}
