"use client";

import { useEffect, useRef, useState } from "react";
import { ChevronRight } from "lucide-react";
import { toast } from "sonner";
import { Switch } from "@/components/ui/switch";

type Props = {
  dealId: string;
  isLicitacion: boolean;
  fechaEntrega?: string | null;
  onFechaChange?: (ymd: string) => void;
  onUpdated?: (next: { isLicitacion: boolean }) => void;
};

/**
 * Filas de Ficha: toggle licitación + fecha de entrega (si está activa).
 * La fecha y el cronograma también viven en Agenda del negocio.
 */
export function DealLicitacionFichaRows({
  dealId,
  isLicitacion,
  fechaEntrega,
  onFechaChange,
  onUpdated,
}: Props) {
  const [enabled, setEnabled] = useState(isLicitacion);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const dateRef = useRef<HTMLInputElement>(null);

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

  const fechaLabel = fechaEntrega
    ? new Date(`${fechaEntrega.slice(0, 10)}T12:00:00`).toLocaleDateString("es-CL", {
        day: "2-digit",
        month: "short",
      })
    : "Definir ›";

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
          La fecha de entrega se agenda en Agenda del negocio.
        </p>
      ) : null}
      {enabled ? (
        <div className="flex min-h-10 items-center justify-between gap-3 py-2">
          <span className="shrink-0 text-[12px] font-medium uppercase tracking-wide text-ds-text-3">
            Fecha de entrega
          </span>
          <button
            type="button"
            onClick={() => {
              const el = dateRef.current;
              if (!el) return;
              if (typeof el.showPicker === "function") el.showPicker();
              else el.click();
            }}
            className="inline-flex min-h-10 items-center gap-1 text-[13px] text-ds-text-1"
          >
            {fechaLabel}
            <ChevronRight className="h-4 w-4 text-ds-text-4" />
          </button>
          <input
            ref={dateRef}
            type="date"
            value={fechaEntrega?.slice(0, 10) ?? ""}
            onChange={(e) => {
              if (e.target.value) onFechaChange?.(e.target.value);
            }}
            className="sr-only"
            aria-label="Fecha de entrega de la licitación"
          />
        </div>
      ) : null}
      {error ? <p className="text-[12px] text-status-danger-fg">{error}</p> : null}
    </>
  );
}
