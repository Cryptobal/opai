"use client";

/**
 * Card "Política de recordatorios" (Fase 18) — política GLOBAL del tenant para
 * los avisos de vencimiento de documentos: hora del digest diario, tope de
 * tarjetas individuales por día, escalamiento al jefe on/off y cadencia
 * post-vencido. Vive en Configuración → Documentos Operacionales, junto a los
 * tipos (la escalera por tipo se edita en cada tipo). El canal por persona
 * sigue en Mis Notificaciones.
 */

import { useEffect, useState } from "react";
import { toast } from "sonner";
import { BellRing, Loader2 } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Switch } from "@/components/ui/switch";

type Policy = {
  digestHour: number;
  maxCardsPerDay: number;
  escalationEnabled: boolean;
  postExpiryCadenceDays: number;
};

export function ExpiryPolicyCard() {
  const [policy, setPolicy] = useState<Policy | null>(null);
  const [saving, setSaving] = useState(false);

  useEffect(() => {
    let cancelled = false;
    void (async () => {
      try {
        const res = await fetch("/api/operacional/expiry-policy");
        const json = await res.json();
        if (!cancelled && json.success) setPolicy(json.data);
      } catch {
        if (!cancelled) toast.error("Error al cargar la política de recordatorios");
      }
    })();
    return () => {
      cancelled = true;
    };
  }, []);

  const handleSave = async () => {
    if (!policy) return;
    setSaving(true);
    try {
      const res = await fetch("/api/operacional/expiry-policy", {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(policy),
      });
      const json = await res.json();
      if (json.success) {
        setPolicy(json.data);
        toast.success("Política guardada");
      } else {
        toast.error(json.error || "Error al guardar");
      }
    } catch {
      toast.error("Error al guardar");
    } finally {
      setSaving(false);
    }
  };

  return (
    <Card>
      <CardContent className="py-4 px-5 space-y-3">
        <div>
          <p className="text-sm font-semibold flex items-center gap-2">
            <BellRing className="h-4 w-4" /> Política de recordatorios
          </p>
          <p className="text-xs text-muted-foreground mt-0.5">
            Los avisos se emiten solo al cruzar hitos (T-30 · T-14 · T-7 · T-3 · T-1 · día 0 y post-vencido).
            El digest diario agrupa todo; la tarjeta individual se reserva para vencidos y tipos crítico-legal.
            El canal por persona se configura en Mis Notificaciones.
          </p>
        </div>
        {!policy ? (
          <div className="flex items-center justify-center py-4">
            <Loader2 className="h-4 w-4 animate-spin text-muted-foreground" />
          </div>
        ) : (
          <>
            <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
              <div className="space-y-1.5">
                <Label className="text-xs">Hora del digest (Chile)</Label>
                <Input
                  type="number"
                  min={0}
                  max={23}
                  value={policy.digestHour}
                  onChange={(e) => setPolicy((p) => p && { ...p, digestHour: Number(e.target.value) })}
                />
                <p className="text-[10px] text-muted-foreground">0–23. Default: 07:00.</p>
              </div>
              <div className="space-y-1.5">
                <Label className="text-xs">Tope de tarjetas por día</Label>
                <Input
                  type="number"
                  min={0}
                  max={50}
                  value={policy.maxCardsPerDay}
                  onChange={(e) => setPolicy((p) => p && { ...p, maxCardsPerDay: Number(e.target.value) })}
                />
                <p className="text-[10px] text-muted-foreground">El excedente se pliega al digest. 0 = sin tope.</p>
              </div>
              <div className="space-y-1.5">
                <Label className="text-xs">Cadencia post-vencido (días)</Label>
                <Input
                  type="number"
                  min={1}
                  max={90}
                  value={policy.postExpiryCadenceDays}
                  onChange={(e) =>
                    setPolicy((p) => p && { ...p, postExpiryCadenceDays: Number(e.target.value) })
                  }
                />
                <p className="text-[10px] text-muted-foreground">Recordatorio +1 tras vencer y luego cada N días.</p>
              </div>
            </div>
            <div className="flex items-center justify-between pt-1">
              <div className="flex items-center gap-2">
                <Switch
                  checked={policy.escalationEnabled}
                  onCheckedChange={(checked) => setPolicy((p) => p && { ...p, escalationEnabled: checked })}
                />
                <Label className="text-xs">
                  Escalar al jefe si cruza T-7 sin acción (ni renovado ni en trámite)
                </Label>
              </div>
              <Button size="sm" onClick={handleSave} disabled={saving}>
                {saving ? <Loader2 className="h-4 w-4 animate-spin mr-2" /> : null}
                Guardar
              </Button>
            </div>
          </>
        )}
      </CardContent>
    </Card>
  );
}
