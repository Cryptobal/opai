"use client";

/**
 * Lista vertical cronológica de próximos eventos para la tarjeta "Mi día"
 * móvil del Hub. Reemplaza las mini-columnas de días (grid-cols-3) que eran
 * ilegibles entre 320 y 430 px. Máximo 4 eventos; el resto vive en
 * /opai/agenda (el Hub no reconstruye el calendario completo).
 */

import Link from "next/link";
import { Tag } from "@/components/opai-ds";
import { cn } from "@/lib/utils";
import { todayInChile } from "@/lib/dates-cl";
import { agendaItemDayKey } from "./agenda-calendar-utils";
import { type HubAgendaItem, hhmm, hubAgendaItemHref } from "./agenda-hub-item";

export const HUB_UPCOMING_MAX = 4;

/**
 * Próximos eventos (hoy en adelante) en orden cronológico. Puro y exportado
 * para tests: filtra días pasados, ordena por inicio y limita a `max`.
 */
export function upcomingAgendaItems(
  items: HubAgendaItem[],
  todayKey: string,
  max = HUB_UPCOMING_MAX,
): HubAgendaItem[] {
  return items
    .filter((i) => agendaItemDayKey(i) >= todayKey)
    .sort((a, b) => {
      const dayDiff = agendaItemDayKey(a).localeCompare(agendaItemDayKey(b));
      if (dayDiff !== 0) return dayDiff;
      // All-day (licitaciones) primero dentro del día, luego por hora.
      if (a.allDay !== b.allDay) return a.allDay ? -1 : 1;
      return new Date(a.start).getTime() - new Date(b.start).getTime();
    })
    .slice(0, Math.max(1, max));
}

function dayLabel(item: HubAgendaItem, todayKey: string): string {
  const key = agendaItemDayKey(item);
  if (key === todayKey) return item.allDay ? "Hoy" : hhmm(item.start);
  const date = /^\d{4}-\d{2}-\d{2}$/.test(item.start)
    ? new Date(`${item.start}T12:00:00`)
    : new Date(item.start);
  const day = date.toLocaleDateString("es-CL", {
    weekday: "short",
    day: "numeric",
    timeZone: "America/Santiago",
  });
  return item.allDay ? day : `${day} ${hhmm(item.start)}`;
}

function contextLabel(item: HubAgendaItem): string {
  if (item.source === "tarea") return "Tarea";
  if (item.source === "google") return item.calendarName || "Google";
  if (item.allDay) return "Licitación";
  return "Visita";
}

export function AgendaHubUpcomingList({
  items,
  className,
}: {
  items: HubAgendaItem[];
  className?: string;
}) {
  const todayKey = todayInChile();
  const upcoming = upcomingAgendaItems(items, todayKey);

  if (upcoming.length === 0) {
    return (
      <p className={cn("text-ds-body text-ds-text-3", className)}>
        Sin eventos próximos.
      </p>
    );
  }

  return (
    <ul className={cn("min-w-0 space-y-1", className)}>
      {upcoming.map((item) => {
        const row = (
          <span className="flex min-h-11 min-w-0 flex-1 items-center gap-2.5">
            <span className="w-16 shrink-0 text-[12px] font-medium tabular-nums text-ds-text-3">
              {dayLabel(item, todayKey)}
            </span>
            <span className="min-w-0 flex-1">
              <span className="block min-w-0 truncate text-ds-body font-medium text-ds-text-1">
                {item.title}
              </span>
              <span className="block min-w-0 truncate text-[12px] text-ds-text-4">
                {contextLabel(item)}
              </span>
            </span>
            {!item.allDay && item.syncStatus && (
              <Tag
                variant={item.syncStatus === "SYNCED" ? "ok" : "warn"}
                size="sm"
                className="shrink-0"
              >
                {item.syncStatus}
              </Tag>
            )}
          </span>
        );

        const rowClass =
          "flex min-w-0 items-center rounded-lg bg-ds-surface-2 px-2.5 py-1 ds-tap";

        if (item.source === "google" && item.htmlLink) {
          return (
            <li key={`google-${item.id}`} className="min-w-0">
              <a
                href={item.htmlLink}
                target="_blank"
                rel="noopener noreferrer"
                className={rowClass}
              >
                {row}
              </a>
            </li>
          );
        }

        return (
          <li key={`${item.source ?? item.type}-${item.id}`} className="min-w-0">
            <Link href={hubAgendaItemHref(item)} className={rowClass}>
              {row}
            </Link>
          </li>
        );
      })}
    </ul>
  );
}
