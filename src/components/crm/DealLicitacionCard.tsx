"use client";

import { useEffect, useState } from "react";
import { toast } from "sonner";
import { Tag, Surface } from "@/components/opai-ds";
import { Switch } from "@/components/ui/switch";

type Props = {
  dealId: string;
  isLicitacion: boolean;
  onUpdated?: (next: { isLicitacion: boolean }) => void;
};

/**
 * Solo marca el negocio como licitación. La fecha de entrega y el sync a
 * Google Calendar viven en Agenda del negocio (eventos/hitos), no aquí.
 */
export function DealLicitacionCard({ dealId, isLicitacion, onUpdated }: Props) {
  const [enabled, setEnabled] = useState(isLicitacion);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    setEnabled(isLicitacion);
  }, [isLicitacion]);

  async function persist(nextEnabled: boolean) {
    setSaving(true);
    setError(null);
    try {
      const res = await fetch(`/api/crm/deals/${dealId}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ isLicitacion: nextEnabled }),
      });
      const json = await res.json();
      if (!res.ok || !json.success) {
        setError(json.error || "No se pudo guardar");
        setEnabled(!nextEnabled);
        return;
      }
      onUpdated?.({ isLicitacion: nextEnabled });
      toast.success(
        nextEnabled
          ? "Marcado como licitación. Agenda la entrega en Agenda del negocio."
          : "Licitación desmarcada.",
      );
    } finally {
      setSaving(false);
    }
  }

  function onToggle() {
    const next = !enabled;
    setEnabled(next);
    void persist(next);
  }

  return (
    <Surface elevation={1} padding="md" className="space-y-3">
      <div className="flex min-w-0 items-center justify-between gap-2">
        <p className="shrink-0 text-xs font-medium uppercase tracking-wide text-ds-text-3">Licitación</p>
        {enabled && (
          <Tag variant="neutral" size="sm" className="max-w-full truncate bg-tint-violet text-tint-violet-fg">
            Licitación
          </Tag>
        )}
      </div>
      <label className="flex items-center justify-between gap-3 text-[13px] text-ds-text-2">
        <span>Marcar como licitación</span>
        <Switch
          size="lg"
          checked={enabled}
          disabled={saving}
          onCheckedChange={() => onToggle()}
          className="ds-tap"
        />
      </label>
      {enabled && (
        <p className="text-[12px] text-ds-text-4">
          La fecha de entrega y el resto del cronograma se agendan abajo en Agenda del negocio (se sincronizan con Google Calendar).
        </p>
      )}
      {error && <p className="text-[12px] text-status-danger-fg">{error}</p>}
    </Surface>
  );
}
