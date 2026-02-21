"use client";

import { useCallback, useEffect, useState } from "react";
import { FileText, Save, Loader2 } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { toast } from "sonner";
import Link from "next/link";

type Prefs = { docExpiryDaysDefault?: number };

export function NotificationConfigClient() {
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [prefs, setPrefs] = useState<Prefs>({});

  const fetchPrefs = useCallback(async () => {
    setLoading(true);
    try {
      const res = await fetch("/api/notifications/config");
      const json = await res.json();
      if (json.success && json.data) setPrefs(json.data);
    } catch {
      toast.error("No se pudieron cargar las preferencias");
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    void fetchPrefs();
  }, [fetchPrefs]);

  const handleChange = (key: string, value: number) => {
    setPrefs((prev) => ({ ...prev, [key]: value }));
  };

  const handleSave = async () => {
    setSaving(true);
    try {
      const res = await fetch("/api/notifications/config", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(prefs),
      });
      const json = await res.json();
      if (json.success) {
        toast.success("Preferencias guardadas");
        if (json.data) setPrefs(json.data);
      } else {
        toast.error(json.error || "Error al guardar");
      }
    } catch {
      toast.error("Error al guardar");
    } finally {
      setSaving(false);
    }
  };

  if (loading) {
    return (
      <div className="flex items-center justify-center py-12">
        <Loader2 className="h-6 w-6 animate-spin text-muted-foreground" />
      </div>
    );
  }

  return (
    <div className="space-y-6 max-w-2xl">
      <div className="rounded-xl border border-border bg-muted/30 p-4 text-sm text-muted-foreground">
        Las preferencias de qué notificaciones recibir (campana y email) se configuran por usuario en{" "}
        <Link href="/opai/perfil/notificaciones" className="text-primary underline hover:no-underline">
          Perfil → Mis notificaciones
        </Link>
        . Cada usuario puede activar o desactivar las que prefiera según su rol y acceso a módulos.
      </div>

      <section className="rounded-xl border border-border bg-card p-5">
        <h3 className="text-sm font-semibold mb-3 flex items-center gap-2">
          <FileText className="h-4 w-4 text-primary" />
          Documentos (módulo Documentos)
        </h3>
        <p className="text-xs text-muted-foreground mb-3">
          Parámetro global para documentos del módulo Documentos. Define cuántos días antes del vencimiento se considera &quot;por vencer&quot; al crear nuevos documentos (si no se especifica otro valor).
        </p>
        <div className="flex items-center gap-3 py-3">
          <label className="text-xs text-muted-foreground whitespace-nowrap">
            Días antes del vencimiento (default para nuevos docs):
          </label>
          <Input
            type="number"
            min={1}
            max={365}
            className="w-20 text-sm"
            value={Number(prefs.docExpiryDaysDefault ?? 30)}
            onChange={(e) =>
              handleChange("docExpiryDaysDefault", Math.max(1, Math.min(365, Number(e.target.value) || 30)))
            }
          />
        </div>
      </section>

      <div className="flex justify-end">
        <Button onClick={() => void handleSave()} disabled={saving} size="sm" className="gap-1.5">
          {saving ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <Save className="h-3.5 w-3.5" />}
          Guardar
        </Button>
      </div>
    </div>
  );
}
