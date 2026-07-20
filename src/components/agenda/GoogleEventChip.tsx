"use client";

import { Clock, ExternalLink } from "lucide-react";

type Props = {
  title: string;
  start: string;
  allDay?: boolean;
  htmlLink?: string | null;
};

/**
 * Chip neutro para eventos de Google Calendar (distinto de técnica/cliente/
 * supervisión). Click → abre el evento en Google Calendar en pestaña nueva.
 */
export function GoogleEventChip({ title, start, allDay, htmlLink }: Props) {
  const time = allDay
    ? "Todo el día"
    : new Date(start).toLocaleTimeString("es-CL", { hour: "2-digit", minute: "2-digit" });

  return (
    <a
      href={htmlLink || undefined}
      target="_blank"
      rel="noopener noreferrer"
      className="block w-full rounded-xl border border-ds-border-subtle bg-ds-surface-3 px-2 py-1.5 text-left text-[12px] text-ds-text-2 ds-tap"
    >
      <div className="flex items-center justify-between gap-1">
        <span className="flex items-center gap-1 font-medium">
          <Clock className="h-3 w-3 shrink-0 opacity-70" />
          {time}
        </span>
        {htmlLink && <ExternalLink className="h-3 w-3 shrink-0 opacity-60" />}
      </div>
      <p className="truncate">{title}</p>
      <span className="mt-1 inline-block text-[11px] font-mono uppercase tracking-[0.08em] text-ds-text-4">
        Google Calendar
      </span>
    </a>
  );
}
