"use client";

import { useState } from "react";
import { toast } from "sonner";
import { Loader2, Save } from "lucide-react";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Label } from "@/components/ui/label";
import { Input } from "@/components/ui/input";
import { Switch } from "@/components/ui/switch";
import { Button } from "@/components/ui/button";
import type { KnowledgeConfig } from "@/lib/knowledge/config";

interface Props {
  initial: KnowledgeConfig;
}

export function KnowledgeConfigClient({ initial }: Props) {
  const [cfg, setCfg] = useState<KnowledgeConfig>(initial);
  const [saving, setSaving] = useState(false);

  async function save() {
    setSaving(true);
    try {
      const res = await fetch("/api/configuracion/knowledge", {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(cfg),
      });
      const json = (await res.json()) as
        | { success: true; data: KnowledgeConfig }
        | { success: false; error: string };
      if (!res.ok || !json.success) {
        throw new Error("error" in json ? json.error : "No se pudo guardar");
      }
      setCfg(json.data);
      toast.success("Configuración guardada");
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "Error al guardar");
    } finally {
      setSaving(false);
    }
  }

  return (
    <div className="space-y-5 max-w-2xl">
      <Card>
        <CardHeader>
          <CardTitle className="text-base">Frecuencia recurrente</CardTitle>
        </CardHeader>
        <CardContent className="space-y-4">
          <div className="space-y-1.5">
            <Label htmlFor="recurringDefaultDays">Días por defecto</Label>
            <Input
              id="recurringDefaultDays"
              type="number"
              min={1}
              max={365}
              value={cfg.recurringDefaultDays}
              onChange={(e) =>
                setCfg({ ...cfg, recurringDefaultDays: Number(e.target.value) || 0 })
              }
            />
            <p className="text-xs text-muted-foreground">
              Cada cuántos días se reenvía un examen recurrente a un guardia activo. Cada
              examen puede sobreescribir este valor.
            </p>
          </div>

          <div className="space-y-1.5">
            <Label htmlFor="dispatchHourCl">Hora de despacho (Chile)</Label>
            <Input
              id="dispatchHourCl"
              type="number"
              min={0}
              max={23}
              value={cfg.dispatchHourCl}
              onChange={(e) =>
                setCfg({ ...cfg, dispatchHourCl: Number(e.target.value) || 0 })
              }
            />
            <p className="text-xs text-muted-foreground">
              Hora aproximada en que el cron procesa los envíos. Informativa: el cron
              corre 03:00 UTC ≈ 00:00 CL.
            </p>
          </div>
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle className="text-base">Plazos y recordatorios</CardTitle>
        </CardHeader>
        <CardContent className="space-y-4">
          <div className="space-y-1.5">
            <Label htmlFor="deadlineDays">Días para responder</Label>
            <Input
              id="deadlineDays"
              type="number"
              min={1}
              max={365}
              value={cfg.deadlineDays}
              onChange={(e) =>
                setCfg({ ...cfg, deadlineDays: Number(e.target.value) || 0 })
              }
            />
            <p className="text-xs text-muted-foreground">
              Si el guardia no responde en este plazo, el examen pasa a estado &quot;expirado&quot;.
            </p>
          </div>

          <div className="space-y-1.5">
            <Label htmlFor="reminderDays">Días para recordatorio</Label>
            <Input
              id="reminderDays"
              type="number"
              min={0}
              max={365}
              value={cfg.reminderDays}
              onChange={(e) =>
                setCfg({ ...cfg, reminderDays: Number(e.target.value) || 0 })
              }
            />
            <p className="text-xs text-muted-foreground">
              Días después del envío inicial sin abrir para enviar un recordatorio. 0 =
              desactivado.
            </p>
          </div>
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle className="text-base">Notificaciones</CardTitle>
        </CardHeader>
        <CardContent>
          <div className="flex items-center justify-between gap-4">
            <div className="min-w-0">
              <Label htmlFor="emailEnabled">Enviar email a guardias</Label>
              <p className="text-xs text-muted-foreground mt-0.5">
                Si lo desactivás, el examen igual aparece en el portal del guardia, pero
                no se envía mail.
              </p>
            </div>
            <Switch
              id="emailEnabled"
              checked={cfg.emailEnabled}
              onCheckedChange={(checked) => setCfg({ ...cfg, emailEnabled: checked })}
            />
          </div>
        </CardContent>
      </Card>

      <div className="flex justify-end">
        <Button onClick={save} disabled={saving}>
          {saving ? (
            <Loader2 className="h-4 w-4 animate-spin" />
          ) : (
            <Save className="h-4 w-4" />
          )}
          {saving ? "Guardando..." : "Guardar cambios"}
        </Button>
      </div>
    </div>
  );
}
