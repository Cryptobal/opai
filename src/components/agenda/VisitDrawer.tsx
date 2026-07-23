"use client";

import { useEffect, useState, type MouseEvent } from "react";
import { Surface } from "@/components/opai-ds";
import { confirmDialog } from "@/components/ui/confirm-service";

type Props = {
  visitaId: string | null;
  onClose: () => void;
  onChanged?: () => void;
};

export function VisitDrawer({ visitaId, onClose, onChanged }: Props) {
  const [data, setData] = useState<{
    visita: {
      title: string;
      startAt: string;
      endAt: string;
      notes: string | null;
      status: string;
      installation?: { address?: string | null; lat?: number | null; lng?: number | null } | null;
    };
    syncStatus: string;
    htmlLink?: string | null;
  } | null>(null);
  const [resultNote, setResultNote] = useState("");
  const [newStart, setNewStart] = useState("");

  useEffect(() => {
    if (!visitaId) return;
    fetch(`/api/agenda/visitas/${visitaId}`)
      .then((r) => r.json())
      .then(setData)
      .catch(() => setData(null));
  }, [visitaId]);

  if (!visitaId) return null;

  const maps =
    data?.visita.installation?.lat != null && data.visita.installation.lng != null
      ? `https://www.google.com/maps?q=${data.visita.installation.lat},${data.visita.installation.lng}`
      : data?.visita.installation?.address
        ? `https://www.google.com/maps/search/?api=1&query=${encodeURIComponent(data.visita.installation.address)}`
        : null;

  async function patch(body: Record<string, unknown>) {
    await fetch(`/api/agenda/visitas/${visitaId}`, {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(body),
    });
    onChanged?.();
    onClose();
  }

  return (
    <div className="fixed inset-0 z-50 flex justify-end bg-black/40" onClick={onClose}>
      <Surface
        elevation={2}
        padding="md"
        className="h-full w-full max-w-md space-y-4 overflow-y-auto"
        onClick={(e: MouseEvent) => e.stopPropagation()}
      >
        <div className="flex items-center justify-between">
          <p className="font-display text-base font-semibold">{data?.visita.title || "Visita"}</p>
          <button type="button" onClick={onClose} className="text-[13px] text-ds-text-3">
            Cerrar
          </button>
        </div>
        <p className="text-[13px] text-ds-text-3">
          {data ? new Date(data.visita.startAt).toLocaleString("es-CL") : "…"} · Google{" "}
          {data?.syncStatus}
        </p>
        <div className="rounded-xl border border-dashed border-ds-border-subtle bg-ds-surface-2 p-4 text-[13px] text-ds-text-3">
          {data?.visita.installation?.address || "Sin dirección"}
          {maps && (
            <a href={maps} target="_blank" rel="noreferrer" className="mt-2 block text-primary">
              Abrir en Google Maps
            </a>
          )}
        </div>
        {data?.visita.notes && (
          <p className="text-[13px] text-ds-text-2">{data.visita.notes}</p>
        )}
        {data?.htmlLink && (
          <a
            href={data.htmlLink}
            target="_blank"
            rel="noreferrer"
            className="inline-flex h-10 w-full items-center justify-center rounded-xl border border-ds-border-default text-[13px] text-ds-text-2 ds-tap sm:h-9"
          >
            Ver en Google Calendar
          </a>
        )}
        <div className="space-y-2">
          <label className="text-[12px] text-ds-text-3">Reprogramar</label>
          <input
            type="datetime-local"
            className="h-10 w-full rounded-xl border border-ds-border-default px-3 text-[13px] sm:h-9"
            value={newStart}
            onChange={(e) => setNewStart(e.target.value)}
          />
          <button
            type="button"
            disabled={!newStart}
            onClick={() => {
              const start = new Date(newStart);
              const end = new Date(start.getTime() + 60 * 60_000);
              void patch({ startAt: start.toISOString(), endAt: end.toISOString() });
            }}
            className="h-10 w-full rounded-xl border border-ds-border-default text-[13px] ds-tap sm:h-9"
          >
            Guardar reprogramación
          </button>
        </div>
        <div className="space-y-2">
          <input
            className="h-10 w-full rounded-xl border border-ds-border-default px-3 text-[13px] sm:h-9"
            placeholder="Nota de resultado"
            value={resultNote}
            onChange={(e) => setResultNote(e.target.value)}
          />
          <button
            type="button"
            onClick={() => void patch({ action: "complete", resultNote })}
            className="h-10 w-full rounded-xl bg-primary text-[13px] text-primary-foreground ds-tap sm:h-9"
          >
            Completar
          </button>
          <button
            type="button"
            onClick={() => {
              void confirmDialog({
                description: "¿Cancelar visita?",
                variant: "destructive",
                confirmLabel: "Cancelar visita",
              }).then((ok) => {
                if (ok) void patch({ action: "cancel" });
              });
            }}
            className="h-10 w-full rounded-xl border border-status-danger-border text-[13px] text-status-danger-fg ds-tap sm:h-9"
          >
            Cancelar visita
          </button>
        </div>
      </Surface>
    </div>
  );
}
