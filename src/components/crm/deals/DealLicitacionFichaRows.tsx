"use client";

import { useEffect, useState } from "react";
import { toast } from "sonner";
import { Switch } from "@/components/ui/switch";

type Props = {
  dealId: string;
  isLicitacion: boolean;
  onUpdated?: (next: { isLicitacion: boolean }) => void;
};

/**
 * Fila de Ficha: toggle licitación. La fecha de entrega vive en el KPI.
 */
export function DealLicitacionFichaRows({
  dealId,
  isLicitacion,
  onUpdated,
}: Props) {
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
          ? "Marcado como licitación. La entrega se define en el KPI."
          : "Licitación desmarcada.",
      );
    } finally {
      setSaving(false);
    }
  }

  return (
    <>
      <div className="flex min-h-10 items-center justify-between gap-3 py-2">
        <span className="shrink-0 text-[12px] font-medium uppercase tracking-wide text-ds-text-3">
          Licitación
        </span>
        <Switch
          size="lg"
          checked={enabled}
          disabled={saving}
          onCheckedChange={() => {
            const next = !enabled;
            setEnabled(next);
            void persist(next);
          }}
          className="ds-tap"
        />
      </div>
      {enabled ? (
        <p className="pb-1 text-[12px] text-ds-text-4">
          La fecha de entrega se edita en el KPI. Los hitos viven en la banda de licitación.
        </p>
      ) : null}
      {error ? <p className="text-[12px] text-status-danger-fg">{error}</p> : null}
    </>
  );
}
