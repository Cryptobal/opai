"use client";

import { useCallback, useEffect, useState } from "react";
import { toast } from "sonner";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Switch } from "@/components/ui/switch";
import { Newspaper } from "lucide-react";
import type { SlackDigestConfig, SlackDigestKey } from "@/lib/integrations/slack/digest-config";

type DigestMeta = { key: SlackDigestKey; label: string; description: string };

/** Panel de activación/desactivación de digests periódicos a Slack. */
export function SlackDigestsPanel() {
  const [digests, setDigests] = useState<SlackDigestConfig | null>(null);
  const [meta, setMeta] = useState<DigestMeta[]>([]);
  const [loading, setLoading] = useState(true);
  const [busyKey, setBusyKey] = useState<SlackDigestKey | null>(null);

  const load = useCallback(async () => {
    try {
      const res = await fetch("/api/integrations/slack/digests");
      const data = await res.json();
      if (!res.ok || !data.success) throw new Error();
      setDigests(data.digests as SlackDigestConfig);
      setMeta((data.meta as DigestMeta[]) ?? []);
    } catch {
      toast.error("No se pudieron cargar los digests de Slack");
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    void load();
  }, [load]);

  async function toggle(key: SlackDigestKey, enabled: boolean) {
    if (!digests) return;
    const prev = digests;
    setDigests({ ...digests, [key]: enabled });
    setBusyKey(key);
    try {
      const res = await fetch("/api/integrations/slack/digests", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ [key]: enabled }),
      });
      const data = await res.json();
      if (!res.ok || !data.success) throw new Error(data.error ?? "Error");
      setDigests(data.digests as SlackDigestConfig);
      toast.success(enabled ? "Digest activado" : "Digest desactivado");
    } catch (err) {
      setDigests(prev);
      toast.error(err instanceof Error ? err.message : "No se pudo guardar");
    } finally {
      setBusyKey(null);
    }
  }

  if (loading) {
    return (
      <Card>
        <CardContent className="py-6">
          <p className="text-sm text-muted-foreground">Cargando digests…</p>
        </CardContent>
      </Card>
    );
  }

  if (!digests) return null;

  return (
    <Card>
      <CardHeader>
        <CardTitle className="flex items-center gap-2">
          <Newspaper className="h-5 w-5" /> Digests y reportes periódicos
        </CardTitle>
        <CardDescription>
          Activa o silencia cada resumen que OPAI publica en Slack (canal y DM del
          bot). Las alarmas en tiempo real (tickets, leads, etc.) se rutean más abajo;
          esto solo afecta digests.
        </CardDescription>
      </CardHeader>
      <CardContent className="space-y-2">
        {meta.map((item) => (
          <div
            key={item.key}
            className="flex flex-col gap-2 rounded-xl border border-border/60 bg-card/40 p-3 sm:flex-row sm:items-center sm:justify-between"
          >
            <div className="min-w-0">
              <p className="text-sm font-medium">{item.label}</p>
              <p className="text-xs text-muted-foreground">{item.description}</p>
            </div>
            <div className="flex items-center gap-2 sm:shrink-0">
              <span className="text-xs text-muted-foreground">
                {digests[item.key] ? "Activo" : "Apagado"}
              </span>
              <Switch
                checked={digests[item.key]}
                onCheckedChange={(v) => void toggle(item.key, v)}
                disabled={busyKey === item.key}
                aria-label={`Activar ${item.label}`}
              />
            </div>
          </div>
        ))}
      </CardContent>
    </Card>
  );
}
