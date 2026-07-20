"use client";

import { useEffect, useState } from "react";
import { Radar } from "lucide-react";
import { Switch } from "@/components/ui/switch";
import { Surface, IconBubble } from "@/components/opai-ds";

/**
 * Kill-switch del Radar Comercial (setting `radar_comercial_enabled`).
 * Con el radar apagado, la clasificación IA de correos y los crons del radar
 * quedan en silencio para el tenant.
 */
export function RadarComercialToggle() {
  const [enabled, setEnabled] = useState<boolean | null>(null);
  const [canManage, setCanManage] = useState(false);
  const [saving, setSaving] = useState(false);

  useEffect(() => {
    fetch("/api/crm/radar/settings")
      .then((r) => r.json())
      .then((d) => {
        setEnabled(Boolean(d.enabled));
        setCanManage(Boolean(d.canManage));
      })
      .catch(() => setEnabled(true));
  }, []);

  async function toggle(v: boolean) {
    const prev = enabled;
    setEnabled(v);
    setSaving(true);
    try {
      const res = await fetch("/api/crm/radar/settings", {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ enabled: v }),
      });
      if (!res.ok) setEnabled(prev);
    } catch {
      setEnabled(prev);
    } finally {
      setSaving(false);
    }
  }

  if (enabled === null) return null;

  return (
    <Surface elevation={1} padding="md" className="flex items-center justify-between gap-4">
      <div className="flex items-start gap-3">
        <IconBubble icon={Radar} tone="violet" size="md" />
        <div>
          <p className="font-display text-sm font-semibold text-ds-text-1">Radar Comercial</p>
          <p className="mt-0.5 text-[13px] text-ds-text-3">
            Detecta leads, señales de compra y compromisos en tus correos y te avisa por
            Slack y en el hub. La IA sugiere; tú decides — nunca envía ni crea nada solo.
          </p>
        </div>
      </div>
      <Switch
        size="lg"
        checked={enabled}
        disabled={!canManage || saving}
        onCheckedChange={toggle}
      />
    </Surface>
  );
}
