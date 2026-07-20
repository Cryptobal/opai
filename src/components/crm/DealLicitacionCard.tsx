"use client";

import { useState } from "react";
import { toast } from "sonner";
import { Tag, Surface } from "@/components/opai-ds";

type Props = {
  dealId: string;
  isLicitacion: boolean;
  fechaEntrega: string | null;
  onUpdated?: (next: { isLicitacion: boolean; fechaEntrega: string | null }) => void;
};

function fmt(d: string): string {
  const [y, m, day] = d.split("-");
  return day && m && y ? `${day}-${m}-${y}` : d;
}

export function DealLicitacionCard({ dealId, isLicitacion, fechaEntrega, onUpdated }: Props) {
  const initial = fechaEntrega?.slice(0, 10) ?? "";
  const [enabled, setEnabled] = useState(isLicitacion);
  const [fecha, setFecha] = useState(initial);
  const [savedFecha, setSavedFecha] = useState(isLicitacion ? initial : "");
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function persist(nextEnabled: boolean, nextFecha: string) {
    setSaving(true);
    setError(null);
    try {
      const res = await fetch(`/api/crm/deals/${dealId}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          isLicitacion: nextEnabled,
          fechaEntrega: nextEnabled ? nextFecha : null,
        }),
      });
      const json = await res.json();
      if (!res.ok || !json.success) {
        setError(json.error || "No se pudo guardar");
        return;
      }
      setSavedFecha(nextEnabled ? nextFecha : "");
      onUpdated?.({ isLicitacion: nextEnabled, fechaEntrega: nextEnabled ? nextFecha : null });
      toast.success(
        nextEnabled
          ? "Licitación guardada — se sincroniza al calendario del responsable."
          : "Licitación desmarcada.",
      );
    } finally {
      setSaving(false);
    }
  }

  // El toggle SOLO cambia el estado local (el datepicker aparece de inmediato).
  // Al activar no se persiste hasta elegir fecha; al desactivar se persiste ya.
  function onToggle() {
    if (enabled) {
      setEnabled(false);
      setFecha("");
      void persist(false, "");
    } else {
      setEnabled(true);
      setError(null);
    }
  }

  const dirty = enabled && !!fecha && fecha !== savedFecha;

  return (
    <Surface elevation={1} padding="md" className="space-y-3">
      <div className="flex items-center justify-between gap-2">
        <p className="text-xs font-medium uppercase tracking-wide text-ds-text-3">Licitación</p>
        {enabled && savedFecha && (
          <Tag variant="neutral" size="sm" className="bg-tint-violet text-tint-violet-fg">
            Licitación · entrega {fmt(savedFecha)}
          </Tag>
        )}
      </div>
      <label className="flex items-center justify-between gap-3 text-[13px] text-ds-text-2">
        <span>Marcar como licitación</span>
        <button
          type="button"
          role="switch"
          aria-checked={enabled}
          disabled={saving}
          onClick={onToggle}
          className={`relative h-7 w-12 shrink-0 rounded-full transition-colors ds-tap ${
            enabled ? "bg-primary" : "bg-ds-surface-3"
          }`}
        >
          <span
            className={`absolute top-0.5 h-6 w-6 rounded-full bg-background shadow transition-transform ${
              enabled ? "translate-x-5" : "translate-x-0.5"
            }`}
          />
        </button>
      </label>
      {enabled && (
        <div className="space-y-1.5">
          <label className="text-[12px] text-ds-text-3">Fecha de entrega</label>
          <div className="flex items-center gap-2">
            <input
              type="date"
              value={fecha}
              onChange={(e) => {
                const v = e.target.value;
                setFecha(v);
                setError(null);
                if (v && v !== savedFecha) void persist(true, v);
              }}
              className="h-10 flex-1 rounded-xl border border-ds-border-default bg-ds-surface-1 px-3 text-[13px] sm:h-9"
            />
            {dirty && (
              <button
                type="button"
                disabled={saving}
                onClick={() => (fecha ? void persist(true, fecha) : setError("Elegí la fecha de entrega para guardar"))}
                className="inline-flex h-10 items-center rounded-xl bg-primary px-3 text-[12px] font-medium text-primary-foreground ds-tap sm:h-9"
              >
                Guardar
              </button>
            )}
          </div>
          {!savedFecha && (
            <p className="text-[12px] text-ds-text-4">Elegí la fecha de entrega para activar la licitación.</p>
          )}
        </div>
      )}
      {error && <p className="text-[12px] text-status-danger-fg">{error}</p>}
    </Surface>
  );
}
