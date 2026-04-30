"use client";

import { useEffect, useState } from "react";
import { Loader2, Moon } from "lucide-react";
import { toast } from "sonner";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Label } from "@/components/ui/label";
import { Switch } from "@/components/ui/switch";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";

interface QuietHoursState {
  quietHoursStart: number | null;
  quietHoursEnd: number | null;
  quietHoursTz: string;
}

const HOUR_OPTIONS = Array.from({ length: 24 }, (_, h) => ({
  value: h,
  label: `${h.toString().padStart(2, "0")}:00`,
}));

export function QuietHoursCard() {
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [enabled, setEnabled] = useState(false);
  const [start, setStart] = useState<number>(22);
  const [end, setEnd] = useState<number>(7);

  useEffect(() => {
    let cancelled = false;
    (async () => {
      try {
        const res = await fetch("/api/notifications/quiet-hours", { cache: "no-store" });
        const json = (await res.json()) as { success: boolean; data: QuietHoursState };
        if (cancelled) return;
        if (json.success && json.data) {
          if (json.data.quietHoursStart != null && json.data.quietHoursEnd != null) {
            setEnabled(true);
            setStart(json.data.quietHoursStart);
            setEnd(json.data.quietHoursEnd);
          }
        }
      } catch {
        toast.error("No se pudo cargar tu configuración de no molestar");
      } finally {
        if (!cancelled) setLoading(false);
      }
    })();
    return () => {
      cancelled = true;
    };
  }, []);

  const save = async () => {
    setSaving(true);
    try {
      const body = enabled
        ? { quietHoursStart: start, quietHoursEnd: end }
        : { quietHoursStart: null, quietHoursEnd: null };
      const res = await fetch("/api/notifications/quiet-hours", {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(body),
      });
      if (!res.ok) throw new Error("Save failed");
      toast.success("Configuración guardada");
    } catch {
      toast.error("No se pudo guardar la configuración");
    } finally {
      setSaving(false);
    }
  };

  return (
    <Card>
      <CardHeader>
        <CardTitle className="flex items-center gap-2">
          <Moon className="h-4 w-4" />
          No molestar
        </CardTitle>
      </CardHeader>
      <CardContent className="space-y-4">
        <p className="text-sm text-muted-foreground">
          Durante este horario no recibirás notificaciones push (excepto alertas críticas).
          Las notificaciones campana y los emails siguen llegando normalmente.
        </p>

        <div className="flex items-center gap-3">
          <Switch
            id="quiet-enabled"
            checked={enabled}
            onCheckedChange={setEnabled}
            disabled={loading || saving}
          />
          <Label htmlFor="quiet-enabled" className="cursor-pointer">
            Activar horario de no molestar
          </Label>
        </div>

        {enabled && (
          <div className="grid grid-cols-2 gap-4">
            <div className="space-y-1.5">
              <Label htmlFor="quiet-start">Inicio</Label>
              <Select
                value={String(start)}
                onValueChange={(v) => setStart(parseInt(v, 10))}
                disabled={loading || saving}
              >
                <SelectTrigger id="quiet-start">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  {HOUR_OPTIONS.map((h) => (
                    <SelectItem key={h.value} value={String(h.value)}>
                      {h.label}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
            <div className="space-y-1.5">
              <Label htmlFor="quiet-end">Fin</Label>
              <Select
                value={String(end)}
                onValueChange={(v) => setEnd(parseInt(v, 10))}
                disabled={loading || saving}
              >
                <SelectTrigger id="quiet-end">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  {HOUR_OPTIONS.map((h) => (
                    <SelectItem key={h.value} value={String(h.value)}>
                      {h.label}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
          </div>
        )}

        <div className="flex justify-end">
          <Button onClick={save} disabled={loading || saving}>
            {saving ? <Loader2 className="mr-2 h-4 w-4 animate-spin" /> : null}
            Guardar
          </Button>
        </div>
      </CardContent>
    </Card>
  );
}
