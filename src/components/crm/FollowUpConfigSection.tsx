/* eslint-disable @typescript-eslint/no-misused-promises */
"use client";

import { useEffect, useState } from "react";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Badge } from "@/components/ui/badge";
import { ChevronDown, ChevronRight, Loader2, Save, Mail, Clock, MessageSquare, ArrowRightLeft, Pause, Bell } from "lucide-react";
import { toast } from "sonner";

type DocTemplate = {
  id: string;
  name: string;
  category: string;
};

type FollowUpConfig = {
  id: string;
  firstFollowUpDays: number;
  secondFollowUpDays: number;
  firstEmailTemplateId: string | null;
  secondEmailTemplateId: string | null;
  whatsappFirstEnabled: boolean;
  whatsappSecondEnabled: boolean;
  autoAdvanceStage: boolean;
  pauseOnReply: boolean;
  sendHour: number;
  isActive: boolean;
};

const selectCn =
  "flex h-10 w-full rounded-md border border-input bg-background px-3 py-2 text-sm text-foreground focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-ring";
const inputCn =
  "bg-background text-foreground placeholder:text-muted-foreground border-input focus-visible:ring-ring";

export function FollowUpConfigSection() {
  const [open, setOpen] = useState(false);
  const [loading, setLoading] = useState(false);
  const [saving, setSaving] = useState(false);
  const [config, setConfig] = useState<FollowUpConfig | null>(null);
  const [docTemplates, setDocTemplates] = useState<DocTemplate[]>([]);

  useEffect(() => {
    if (!open) return;

    setLoading(true);
    fetch("/api/crm/followup-config")
      .then((res) => res.json())
      .then((data) => {
        if (data.success) {
          setConfig(data.data.config);
          setDocTemplates(data.data.docTemplates || []);
        }
      })
      .catch(() => toast.error("Error cargando configuración"))
      .finally(() => setLoading(false));
  }, [open]);

  const saveConfig = async () => {
    if (!config) return;
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

  return (
    <Card className="lg:col-span-2">
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
              Configura los correos de seguimiento después de enviar una propuesta.
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
            <div className="flex items-center justify-center p-8">
              <Loader2 className="h-5 w-5 animate-spin text-muted-foreground" />
            </div>
          ) : config ? (
            <>
              {/* Toggle activo */}
              <div className="flex items-center justify-between rounded-lg border border-border p-4">
                <div>
                  <p className="font-medium">Seguimientos automáticos</p>
                  <p className="text-xs text-muted-foreground">
                    Enviar correos de seguimiento automáticamente después de enviar una propuesta.
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

              {/* Timing */}
              <div className="space-y-3">
                <div className="flex items-center gap-2 text-xs font-medium text-muted-foreground uppercase tracking-wider">
                  <Clock className="h-3.5 w-3.5" />
                  Tiempos de envío
                </div>
                <div className="grid gap-4 sm:grid-cols-3">
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
                  Los días se cuentan desde la fecha de envío de la propuesta. El 2do seguimiento se envía X días después de la propuesta (no del 1er seguimiento).
                </p>
              </div>

              {/* Templates */}
              <div className="space-y-3">
                <div className="flex items-center gap-2 text-xs font-medium text-muted-foreground uppercase tracking-wider">
                  <Mail className="h-3.5 w-3.5" />
                  Templates de correo
                </div>
                <div className="grid gap-4 sm:grid-cols-2">
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
                </div>
                <p className="text-[10px] text-muted-foreground">
                  Plantillas del gestor de documentos (módulo Mail). Crea templates con tokens como contact.firstName, deal.proposalLink, etc. en Gestión Documental.
                </p>
              </div>

              {/* Opciones */}
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

              {/* Save button */}
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
