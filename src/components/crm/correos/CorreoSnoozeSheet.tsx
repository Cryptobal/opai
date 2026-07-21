"use client";

import { useState } from "react";
import { fromZonedTime, toZonedTime } from "date-fns-tz";
import { Clock, X } from "lucide-react";
import { Surface } from "@/components/opai-ds";
import { CHILE_TZ } from "@/lib/dates-cl";

type Props = {
  open: boolean;
  onClose: () => void;
  /** Recibe el instante elegido (ISO) y su etiqueta legible en hora Chile. */
  onConfirm: (untilISO: string, label: string) => void;
};

/** Construye un instante UTC a partir de una hora de pared en Chile. */
function atChile(base: Date, opts: { addDays?: number; nextMonday?: boolean; hour: number }): Date {
  const cl = toZonedTime(base, CHILE_TZ);
  if (opts.nextMonday) {
    const delta = ((8 - cl.getDay()) % 7) || 7; // días hasta el próximo lunes (≥1)
    cl.setDate(cl.getDate() + delta);
  } else if (opts.addDays) {
    cl.setDate(cl.getDate() + opts.addDays);
  }
  cl.setHours(opts.hour, 0, 0, 0);
  return fromZonedTime(cl, CHILE_TZ);
}

function fmt(d: Date): string {
  return d.toLocaleString("es-CL", {
    weekday: "short",
    day: "2-digit",
    month: "2-digit",
    hour: "2-digit",
    minute: "2-digit",
    timeZone: CHILE_TZ,
  });
}

/** Sheet de posponer: presets en hora Chile + fecha/hora personalizada. */
export function CorreoSnoozeSheet({ open, onClose, onConfirm }: Props) {
  const [custom, setCustom] = useState("");
  if (!open) return null;

  const now = new Date();
  const presets = [
    { label: "Esta tarde 15:00", at: atChile(now, { hour: 15 }) },
    { label: "Mañana 08:00", at: atChile(now, { addDays: 1, hour: 8 }) },
    { label: "Próximo lunes 08:00", at: atChile(now, { nextMonday: true, hour: 8 }) },
  ].filter((p) => p.at.getTime() > now.getTime());

  function pick(at: Date, label: string) {
    onConfirm(at.toISOString(), label);
    onClose();
  }

  function pickCustom() {
    if (!custom) return;
    const [datePart, timePart] = custom.split("T");
    const [y, mo, d] = datePart.split("-").map(Number);
    const [h, mi] = (timePart || "08:00").split(":").map(Number);
    const at = fromZonedTime(new Date(y, mo - 1, d, h, mi, 0, 0), CHILE_TZ);
    if (Number.isNaN(at.getTime()) || at.getTime() <= Date.now()) return;
    pick(at, fmt(at));
  }

  return (
    <div className="fixed inset-0 z-[60] flex items-end justify-center bg-black/40 md:items-center" onClick={onClose}>
      <Surface
        elevation={2}
        padding="md"
        className="w-full space-y-3 rounded-b-none rounded-t-2xl md:max-w-sm md:rounded-2xl"
        onClick={(e) => e.stopPropagation()}
      >
        <div className="flex items-center justify-between">
          <div className="flex items-center gap-2">
            <Clock className="h-4 w-4 text-tint-violet-fg" />
            <p className="font-display text-sm font-semibold text-ds-text-1">Posponer hasta…</p>
          </div>
          <button type="button" aria-label="Cerrar" onClick={onClose} className="text-ds-text-3 ds-tap">
            <X className="h-5 w-5" />
          </button>
        </div>

        <div className="space-y-1.5">
          {presets.map((p) => (
            <button
              key={p.label}
              type="button"
              onClick={() => pick(p.at, p.label)}
              className="flex min-h-11 w-full items-center justify-between rounded-xl border border-ds-border-subtle bg-ds-surface-1 px-3 text-[13px] text-ds-text-1 ds-tap hover:bg-ds-surface-2"
            >
              <span>{p.label}</span>
              <span className="text-[12px] text-ds-text-4">{fmt(p.at)}</span>
            </button>
          ))}
        </div>

        <div className="space-y-1.5">
          <span className="text-[12px] text-ds-text-3">Elegir fecha y hora</span>
          <div className="flex gap-2">
            <input
              type="datetime-local"
              value={custom}
              onChange={(e) => setCustom(e.target.value)}
              className="h-11 min-w-0 flex-1 rounded-xl border border-ds-border-default bg-ds-surface-1 px-3 text-[13px] text-ds-text-1"
            />
            <button
              type="button"
              onClick={pickCustom}
              disabled={!custom}
              className="h-11 shrink-0 rounded-xl bg-primary px-4 text-[13px] font-medium text-primary-foreground ds-tap disabled:opacity-50"
            >
              Posponer
            </button>
          </div>
        </div>
      </Surface>
    </div>
  );
}
