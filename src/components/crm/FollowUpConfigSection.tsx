/* eslint-disable @typescript-eslint/no-misused-promises */
"use client";

import { useEffect, useMemo, useState } from "react";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Badge } from "@/components/ui/badge";
import { ChevronDown, ChevronRight, Loader2, Save, Mail, Clock, MessageSquare, ArrowRightLeft, Pause, Bell, Copy } from "lucide-react";
import { toast } from "sonner";
import { FormSkeleton } from "@/components/ui/skeleton";

type DocTemplate = {
  id: string;
  name: string;
  category: string;
};

type StageOption = {
  id: string;
  name: string;
  isClosedWon: boolean;
  isClosedLost: boolean;
};

type FollowUpConfig = {
  id: string;
  firstFollowUpDays: number;
  secondFollowUpDays: number;
  thirdFollowUpDays: number;
  firstEmailTemplateId: string | null;
  secondEmailTemplateId: string | null;
  thirdEmailTemplateId: string | null;
  whatsappFirstEnabled: boolean;
  whatsappSecondEnabled: boolean;
  whatsappThirdEnabled: boolean;
  autoAdvanceStage: boolean;
  firstFollowUpStageId: string | null;
  secondFollowUpStageId: string | null;
  pauseOnReply: boolean;
  sendHour: number;
  isActive: boolean;
  bccEnabled: boolean;
  bccEmail: string | null;
};

const selectCn =
  "flex h-9 min-h-[44px] w-full appearance-none rounded-md border border-input bg-background pl-3 pr-8 py-2 text-sm text-foreground bg-[url('data:image/svg+xml,%3Csvg%20xmlns%3D%22http%3A%2F%2Fwww.w3.org%2F2000%2Fsvg%22%20width%3D%2212%22%20height%3D%2212%22%20viewBox%3D%220%200%2024%2024%22%20fill%3D%22none%22%20stroke%3D%22%236b7280%22%20stroke-width%3D%222%22%3E%3Cpath%20d%3D%22m6%209%206%206%206-6%22%2F%3E%3C%2Fsvg%3E')] bg-[length:12px] bg-[right_8px_center] bg-no-repeat focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-ring";
const inputCn =
  "bg-background text-foreground placeholder:text-muted-foreground border-input focus-visible:ring-ring";

const DEFAULT_CONFIG: FollowUpConfig = {
  id: "",
  firstFollowUpDays: 3,
  secondFollowUpDays: 7,
  thirdFollowUpDays: 3,
  firstEmailTemplateId: null,
  secondEmailTemplateId: null,
  thirdEmailTemplateId: null,
  whatsappFirstEnabled: true,
  whatsappSecondEnabled: true,
  whatsappThirdEnabled: true,
  autoAdvanceStage: true,
  firstFollowUpStageId: null,
  secondFollowUpStageId: null,
  pauseOnReply: true,
  sendHour: 9,
  isActive: true,
  bccEnabled: false,
  bccEmail: null,
};

type FollowUpConfigSectionProps = {
  className?: string;
};

export function FollowUpConfigSection({ className }: FollowUpConfigSectionProps) {
  const [open, setOpen] = useState(true);
  const [loading, setLoading] = useState(false);
  const [saving, setSaving] = useState(false);
  const [config, setConfig] = useState<FollowUpConfig | null>(DEFAULT_CONFIG);
  const [docTemplates, setDocTemplates] = useState<DocTemplate[]>([]);
  const [stages, setStages] = useState<StageOption[]>([]);

  useEffect(() => {
    if (!open) return;

    setLoading(true);
    fetch("/api/crm/followup-config")
      .then((res) => res.json())
      .then((data) => {
        if (data.success) {
          setConfig({ ...DEFAULT_CONFIG, ...(data.data.config || {}) });
          setDocTemplates(data.data.docTemplates || []);
          setStages(data.data.stages || []);
        }
      })
      .catch(() => toast.error("Error cargando configuración"))
      .finally(() => setLoading(false));
  }, [open]);

  useEffect(() => {
    if (typeof window === "undefined") return;
    if (window.location.hash !== "#seguimientos-automaticos") return;
    setOpen(true);
    setTimeout(() => {
      document.getElementById("seguimientos-automaticos")?.scrollIntoView({
        behavior: "smooth",
        block: "start",
      });
    }, 50);
  }, []);

  const saveConfig = async () => {
    if (!config) return;
    if (config.bccEnabled && !config.bccEmail?.trim()) {
      toast.error("Debes indicar el correo de copia oculta (BCC)");
      return;
    }
    if (config.thirdFollowUpDays < 1) {
      toast.error("El 3er seguimiento debe ser al menos 1 día después del 2do");
      return;
    }
    setSaving(true);
    try {
      const res = await fetch("/api/crm/followup-config", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(config),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data?.error || "Error");
      setConfig(data.data);
      toast.success("Configuración de seguimientos guardada");
    } catch {
      toast.error("No se pudo guardar la configuración");
    } finally {
      setSaving(false);
    }
  };

  const update = <K extends keyof FollowUpConfig>(key: K, value: FollowUpConfig[K]) => {
    setConfig((prev) => (prev ? { ...prev, [key]: value } : prev));
  };

  const lostStage = useMemo(
    () => stages.find((stage) => stage.isClosedLost),
    [stages]
  );
  const openStages = useMemo(
    () => stages.filter((stage) => !stage.isClosedLost && !stage.isClosedWon),
    [stages]
  );

  return (
    <Card id="seguimientos-automaticos" className={className}>
      <button
        type="button"
        onClick={() => setOpen((o) => !o)}
        className="w-full text-left hover:bg-accent/50 transition-colors rounded-t-lg"
      >
        <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
          <div>
            <CardTitle className="flex items-center gap-2">
              <Mail className="h-4 w-4" />
              Seguimientos automáticos
            </CardTitle>
            <CardDescription>
              Controla automatización, etapas, BCC y cierre automático de negocios.
            </CardDescription>
          </div>
          <div className="flex items-center gap-2">
            {config?.isActive && (
              <Badge variant="outline" className="text-[10px] border-emerald-500/30 text-emerald-500">
                Activo
              </Badge>
            )}
            {open ? (
              <ChevronDown className="h-5 w-5 text-muted-foreground shrink-0" />
            ) : (
              <ChevronRight className="h-5 w-5 text-muted-foreground shrink-0" />
            )}
          </div>
        </CardHeader>
      </button>

      {open && (
        <CardContent className="space-y-6 text-sm">
          {loading ? (
            <FormSkeleton rows={3} />
          ) : config ? (
            <>
              <div className="flex items-center justify-between rounded-lg border border-border p-4 bg-card/70">
                <div>
                  <p className="font-medium">Automatización activa</p>
                  <p className="text-xs text-muted-foreground">
                    Al enviar una propuesta se programan 3 seguimientos automáticos.
                  </p>
                </div>
                <label className="relative inline-flex items-center cursor-pointer">
                  <input
                    type="checkbox"
                    checked={config.isActive}
                    onChange={(e) => update("isActive", e.target.checked)}
                    className="sr-only peer"
                  />
                  <div className="w-11 h-6 bg-gray-600 peer-focus:outline-none rounded-full peer peer-checked:after:translate-x-full peer-checked:bg-primary after:content-[''] after:absolute after:top-[2px] after:left-[2px] after:bg-white after:rounded-full after:h-5 after:w-5 after:transition-all" />
                </label>
              </div>

              <div className="space-y-3">
                <div className="flex items-center gap-2 text-xs font-medium text-muted-foreground uppercase tracking-wider">
                  <Clock className="h-3.5 w-3.5" />
                  Tiempos de envío
                </div>
                <div className="grid gap-4 sm:grid-cols-4">
                  <div className="space-y-1.5">
                    <Label>1er seguimiento (días después)</Label>
                    <Input
                      type="number"
                      min={1}
                      max={30}
                      value={config.firstFollowUpDays}
                      onChange={(e) => update("firstFollowUpDays", Number(e.target.value))}
                      className={inputCn}
                    />
                  </div>
                  <div className="space-y-1.5">
                    <Label>2do seguimiento (días después)</Label>
                    <Input
                      type="number"
                      min={1}
                      max={60}
                      value={config.secondFollowUpDays}
                      onChange={(e) => update("secondFollowUpDays", Number(e.target.value))}
                      className={inputCn}
                    />
                  </div>
                  <div className="space-y-1.5">
                    <Label>3er seguimiento (días después del 2do)</Label>
                    <Input
                      type="number"
                      min={1}
                      max={90}
                      value={config.thirdFollowUpDays}
                      onChange={(e) => update("thirdFollowUpDays", Number(e.target.value))}
                      className={inputCn}
                    />
                  </div>
                  <div className="space-y-1.5">
                    <Label>Hora de envío</Label>
                    <select
                      className={selectCn}
                      value={config.sendHour}
                      onChange={(e) => update("sendHour", Number(e.target.value))}
                    >
                      {Array.from({ length: 24 }, (_, i) => (
                        <option key={i} value={i}>
                          {String(i).padStart(2, "0")}:00 hrs
                        </option>
                      ))}
                    </select>
                  </div>
                </div>
                <p className="text-[10px] text-muted-foreground">
                  El 1er y 2do seguimiento usan días desde la propuesta. El 3ro se calcula desde el 2do seguimiento.
                </p>
              </div>

              <div className="space-y-3">
                <div className="flex items-center gap-2 text-xs font-medium text-muted-foreground uppercase tracking-wider">
                  <Mail className="h-3.5 w-3.5" />
                  Templates de correo
                </div>
                <div className="grid gap-4 sm:grid-cols-3">
                  <div className="space-y-1.5">
                    <Label>Template 1er seguimiento</Label>
                    <select
                      className={selectCn}
                      value={config.firstEmailTemplateId || ""}
                      onChange={(e) => update("firstEmailTemplateId", e.target.value || null)}
                    >
                      <option value="">Sin template (usar default)</option>
                      {docTemplates.map((t) => (
                        <option key={t.id} value={t.id}>
                          {t.name}
                        </option>
                      ))}
                    </select>
                  </div>
                  <div className="space-y-1.5">
                    <Label>Template 2do seguimiento</Label>
                    <select
                      className={selectCn}
                      value={config.secondEmailTemplateId || ""}
                      onChange={(e) => update("secondEmailTemplateId", e.target.value || null)}
                    >
                      <option value="">Sin template (usar default)</option>
                      {docTemplates.map((t) => (
                        <option key={t.id} value={t.id}>
                          {t.name}
                        </option>
                      ))}
                    </select>
                  </div>
                  <div className="space-y-1.5">
                    <Label>Template 3er seguimiento</Label>
                    <select
                      className={selectCn}
                      value={config.thirdEmailTemplateId || ""}
                      onChange={(e) => update("thirdEmailTemplateId", e.target.value || null)}
                    >
                      <option value="">Sin template (usar default)</option>
                      {docTemplates.map((t) => (
                        <option key={t.id} value={t.id}>
                          {t.name}
                        </option>
                      ))}
                    </select>
                  </div>
                </div>
                <p className="text-[10px] text-muted-foreground">
                  Puedes administrar plantillas en Gestión Documental (módulo Mail).
                </p>
              </div>

              <div className="space-y-3">
                <div className="flex items-center gap-2 text-xs font-medium text-muted-foreground uppercase tracking-wider">
                  <Bell className="h-3.5 w-3.5" />
                  Opciones
                </div>
                <div className="grid gap-3 sm:grid-cols-2">
                  <label className="flex items-center gap-3 rounded-lg border border-border p-3 cursor-pointer hover:bg-accent/30 transition-colors">
                    <input
                      type="checkbox"
                      checked={config.autoAdvanceStage}
                      onChange={(e) => update("autoAdvanceStage", e.target.checked)}
                    />
                    <div>
                      <div className="flex items-center gap-1.5">
                        <ArrowRightLeft className="h-3.5 w-3.5 text-muted-foreground" />
                        <span className="text-sm font-medium">Avanzar etapa</span>
                      </div>
                      <p className="text-[10px] text-muted-foreground">
                        Mover automáticamente el deal a "Primer/Segundo seguimiento"
                      </p>
                    </div>
                  </label>

                  <label className="flex items-center gap-3 rounded-lg border border-border p-3 cursor-pointer hover:bg-accent/30 transition-colors">
                    <input
                      type="checkbox"
                      checked={config.pauseOnReply}
                      onChange={(e) => update("pauseOnReply", e.target.checked)}
                    />
                    <div>
                      <div className="flex items-center gap-1.5">
                        <Pause className="h-3.5 w-3.5 text-muted-foreground" />
                        <span className="text-sm font-medium">Pausar si responde</span>
                      </div>
                      <p className="text-[10px] text-muted-foreground">
                        Detener la secuencia si el cliente responde o el deal avanza manualmente
                      </p>
                    </div>
                  </label>

                  <label className="flex items-center gap-3 rounded-lg border border-border p-3 cursor-pointer hover:bg-accent/30 transition-colors">
                    <input
                      type="checkbox"
                      checked={config.whatsappFirstEnabled}
                      onChange={(e) => update("whatsappFirstEnabled", e.target.checked)}
                    />
                    <div>
                      <div className="flex items-center gap-1.5">
                        <MessageSquare className="h-3.5 w-3.5 text-muted-foreground" />
                        <span className="text-sm font-medium">WhatsApp 1er seguimiento</span>
                      </div>
                      <p className="text-[10px] text-muted-foreground">
                        Incluir botón de WhatsApp en la notificación del 1er seguimiento
                      </p>
                    </div>
                  </label>

                  <label className="flex items-center gap-3 rounded-lg border border-border p-3 cursor-pointer hover:bg-accent/30 transition-colors">
                    <input
                      type="checkbox"
                      checked={config.whatsappSecondEnabled}
                      onChange={(e) => update("whatsappSecondEnabled", e.target.checked)}
                    />
                    <div>
                      <div className="flex items-center gap-1.5">
                        <MessageSquare className="h-3.5 w-3.5 text-muted-foreground" />
                        <span className="text-sm font-medium">WhatsApp 2do seguimiento</span>
                      </div>
                      <p className="text-[10px] text-muted-foreground">
                        Incluir botón de WhatsApp en la notificación del 2do seguimiento
                      </p>
                    </div>
                  </label>
                </div>
              </div>

              <div className="space-y-3">
                <div className="flex items-center gap-2 text-xs font-medium text-muted-foreground uppercase tracking-wider">
                  <ArrowRightLeft className="h-3.5 w-3.5" />
                  Acciones de etapa
                </div>
                <div className="grid gap-4 sm:grid-cols-2">
                  <div className="space-y-1.5">
                    <Label>Etapa destino al enviar 1er seguimiento</Label>
                    <select
                      className={selectCn}
                      value={config.firstFollowUpStageId || ""}
                      onChange={(e) => update("firstFollowUpStageId", e.target.value || null)}
                    >
                      <option value="">Auto (buscar por nombre)</option>
                      {openStages.map((stage) => (
                        <option key={stage.id} value={stage.id}>
                          {stage.name}
                        </option>
                      ))}
                    </select>
                  </div>
                  <div className="space-y-1.5">
                    <Label>Etapa destino al enviar 2do seguimiento</Label>
                    <select
                      className={selectCn}
                      value={config.secondFollowUpStageId || ""}
                      onChange={(e) => update("secondFollowUpStageId", e.target.value || null)}
                    >
                      <option value="">Auto (buscar por nombre)</option>
                      {openStages.map((stage) => (
                        <option key={stage.id} value={stage.id}>
                          {stage.name}
                        </option>
                      ))}
                    </select>
                  </div>
                </div>
                <p className="text-[10px] text-muted-foreground">
                  En el 3er seguimiento el negocio se mueve automáticamente a etapa perdida ({lostStage?.name || "etapa con isClosedLost=true"}).
                </p>
              </div>

              <div className="space-y-3">
                <div className="flex items-center gap-2 text-xs font-medium text-muted-foreground uppercase tracking-wider">
                  <Copy className="h-3.5 w-3.5" />
                  Copia oculta (BCC)
                </div>
                <label className="flex items-center gap-3 rounded-lg border border-primary/30 p-3 cursor-pointer hover:bg-accent/30 transition-colors">
                  <input
                    type="checkbox"
                    checked={config.bccEnabled ?? false}
                    onChange={(e) => update("bccEnabled", e.target.checked)}
                  />
                  <div className="flex-1 min-w-0">
                    <span className="text-sm font-medium">
                      Enviar copia oculta de cada seguimiento
                    </span>
                    <p className="text-[10px] text-muted-foreground mb-2">
                      Ideal para auditoría comercial y trazabilidad del envío.
                    </p>
                    {config.bccEnabled && (
                      <Input
                        type="email"
                        placeholder="ej: carlos.irigoyen@gmail.com"
                        value={config.bccEmail ?? ""}
                        onChange={(e) => update("bccEmail", e.target.value || null)}
                        className={`${inputCn} max-w-sm`}
                      />
                    )}
                  </div>
                </label>
              </div>

              <div className="space-y-3">
                <div className="flex items-center gap-2 text-xs font-medium text-muted-foreground uppercase tracking-wider">
                  <MessageSquare className="h-3.5 w-3.5" />
                  WhatsApp por seguimiento
                </div>
                <div className="grid gap-3 sm:grid-cols-3">
                  <label className="flex items-center gap-3 rounded-lg border border-border p-3 cursor-pointer hover:bg-accent/30 transition-colors">
                    <input
                      type="checkbox"
                      checked={config.whatsappFirstEnabled}
                      onChange={(e) => update("whatsappFirstEnabled", e.target.checked)}
                    />
                    <span className="text-sm font-medium">WhatsApp 1er seguimiento</span>
                  </label>

                  <label className="flex items-center gap-3 rounded-lg border border-border p-3 cursor-pointer hover:bg-accent/30 transition-colors">
                    <input
                      type="checkbox"
                      checked={config.whatsappSecondEnabled}
                      onChange={(e) => update("whatsappSecondEnabled", e.target.checked)}
                    />
                    <span className="text-sm font-medium">WhatsApp 2do seguimiento</span>
                  </label>

                  <label className="flex items-center gap-3 rounded-lg border border-border p-3 cursor-pointer hover:bg-accent/30 transition-colors">
                    <input
                      type="checkbox"
                      checked={config.whatsappThirdEnabled}
                      onChange={(e) => update("whatsappThirdEnabled", e.target.checked)}
                    />
                    <span className="text-sm font-medium">WhatsApp 3er seguimiento</span>
                  </label>
                </div>
              </div>

              <div className="flex justify-end pt-2">
                <Button onClick={saveConfig} disabled={saving}>
                  {saving ? (
                    <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                  ) : (
                    <Save className="mr-2 h-4 w-4" />
                  )}
                  Guardar configuración
                </Button>
              </div>
            </>
          ) : (
            <p className="text-sm text-muted-foreground text-center py-4">
              Error cargando configuración. Intenta de nuevo.
            </p>
          )}
        </CardContent>
      )}
    </Card>
  );
}
