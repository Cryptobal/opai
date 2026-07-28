"use client";

import Link from "next/link";
import { ArrowUpRight, Video } from "lucide-react";
import { todayInChile } from "@/lib/dates-cl";
import { agendaItemDayKey } from "@/components/agenda/agenda-calendar-utils";
import {
  type HubAgendaItem,
  hhmm,
  formatRemainingLabel,
} from "@/components/agenda/agenda-hub-item";

/**
 * Franja de próxima acción: primer evento timed de hoy que aún no comienza.
 * Devuelve null si no hay candidato.
 */
export function NextActionBar({
  items,
  loading,
}: {
  items: HubAgendaItem[];
  loading?: boolean;
}) {
  if (loading) return null;

  const now = Date.now();
  const todayKey = todayInChile();
  const next = items
    .filter((i) => !i.allDay && agendaItemDayKey(i) === todayKey)
    .filter((i) => new Date(i.start).getTime() > now)
    .sort((a, b) => a.start.localeCompare(b.start))[0];

  if (!next) return null;

  const meta = [
    hhmm(next.start),
    next.accountName || next.calendarName || null,
    next.source === "google" ? "Google" : next.source === "tarea" ? "Tarea" : null,
  ]
    .filter(Boolean)
    .join(" · ");

  const actionHref = next.htmlLink || next.href || "/opai/agenda";
  const actionLabel = next.htmlLink ? "Unirse" : "Ver";
  const ActionIcon = next.htmlLink ? Video : ArrowUpRight;
  const isExternal = Boolean(next.htmlLink);

  return (
    <div className="flex min-h-11 min-w-0 items-center gap-3 rounded-xl border border-ds-border-subtle bg-ds-surface-1 px-3 py-2">
      <span className="shrink-0 rounded-md bg-primary/10 px-2 py-1 text-[12px] font-medium tabular-nums text-primary">
        {formatRemainingLabel(next.start)}
      </span>
      <div className="min-w-0 flex-1">
        <p className="truncate text-[13px] font-medium text-ds-text-1">{next.title}</p>
        {meta && <p className="truncate text-[12px] text-ds-text-4">{meta}</p>}
      </div>
      {isExternal ? (
        <a
          href={actionHref}
          target="_blank"
          rel="noopener noreferrer"
          className="inline-flex min-h-11 shrink-0 items-center gap-1 rounded-lg px-2.5 text-[13px] font-medium text-primary transition-colors hover:bg-ds-surface-2 sm:min-h-9"
        >
          <ActionIcon className="h-3.5 w-3.5" />
          {actionLabel}
        </a>
      ) : (
        <Link
          href={actionHref}
          className="inline-flex min-h-11 shrink-0 items-center gap-1 rounded-lg px-2.5 text-[13px] font-medium text-primary transition-colors hover:bg-ds-surface-2 sm:min-h-9"
        >
          <ActionIcon className="h-3.5 w-3.5" />
          {actionLabel}
        </Link>
      )}
    </div>
  );
}
