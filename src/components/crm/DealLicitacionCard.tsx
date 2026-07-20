"use client";

import { useState } from "react";
import { Tag, Surface } from "@/components/opai-ds";

type Props = {
  dealId: string;
  isLicitacion: boolean;
  fechaEntrega: string | null;
  onUpdated?: (next: { isLicitacion: boolean; fechaEntrega: string | null }) => void;
};

export function DealLicitacionCard({ dealId, isLicitacion, fechaEntrega, onUpdated }: Props) {
  const [enabled, setEnabled] = useState(isLicitacion);
  const [fecha, setFecha] = useState(fechaEntrega?.slice(0, 10) ?? "");
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function save(nextEnabled: boolean, nextFecha: string) {
    if (nextEnabled && !nextFecha) {
      setError("La fecha de entrega es obligatoria");
      return;
    }
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
      setEnabled(nextEnabled);
      setFecha(nextFecha);
      onUpdated?.({
        isLicitacion: nextEnabled,
        fechaEntrega: nextEnabled ? nextFecha : null,
      });
    } finally {
      setSaving(false);
    }
  }

  return (
    <Surface elevation={1} padding="md" className="space-y-3">
      <div className="flex items-center justify-between gap-2">
        <p className="text-xs font-medium uppercase tracking-wide text-ds-text-3">Licitación</p>
        {enabled && (
          <Tag variant="neutral" size="sm" className="bg-tint-violet text-tint-violet-fg">
            Licitación
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
          onClick={() => void save(!enabled, fecha)}
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
          <input
            type="date"
            value={fecha}
            onChange={(e) => setFecha(e.target.value)}
            onBlur={() => void save(true, fecha)}
            className="h-10 w-full rounded-xl border border-ds-border-default bg-ds-surface-1 px-3 text-[13px] sm:h-9"
          />
        </div>
      )}
      {error && <p className="text-[12px] text-status-danger-fg">{error}</p>}
    </Surface>
  );
}
