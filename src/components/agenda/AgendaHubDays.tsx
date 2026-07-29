"use client";

import Link from "next/link";
import { ymdInChile } from "@/lib/dates-cl";
import { agendaItemDayKey } from "./agenda-calendar-utils";
import {
  type HubAgendaItem,
  hhmm,
  hubAgendaDayHref,
  hubAgendaItemHref,
} from "./agenda-hub-item";

/** Grilla de próximos días del hub (hoy+1 en adelante), con eventos Google.
 *  Solo desktop (≥ sm): en móvil la tarjeta usa AgendaHubUpcomingList (lista
 *  vertical) — las mini-columnas eran ilegibles entre 320 y 430 px. */
export function AgendaHubDays({
  items,
  days,
  expanded,
}: {
  items: HubAgendaItem[];
  days: Date[];
  expanded: boolean;
}) {
  return (
    <div className={`hidden gap-2 sm:grid ${expanded ? "sm:grid-cols-7" : "sm:grid-cols-3"}`}>
      {days.slice(1).map((d) => {
        const dayKey = ymdInChile(d);
        const dayItems = items.filter((i) => agendaItemDayKey(i) === dayKey);
        return (
          <div key={dayKey} className="min-w-0 rounded-xl border border-ds-border-subtle p-2">
            <Link
              href={hubAgendaDayHref(dayKey)}
              className="mb-1 block text-[12px] font-medium capitalize text-ds-text-3 transition-colors hover:text-primary"
            >
              {d.toLocaleDateString("es-CL", {
                weekday: "short",
                day: "numeric",
                timeZone: "America/Santiago",
              })}
            </Link>
            <ul className="space-y-1">
              {dayItems.slice(0, 3).map((i) => {
                const href = hubAgendaItemHref(i);
                if (i.source === "tarea") {
                  return (
                    <li key={`tarea-${i.id}`} className="truncate text-[12px]">
                      <Link href={href} className="text-primary">
                        ✓ {i.allDay ? i.title : `${hhmm(i.start)} · ${i.title}`}
                      </Link>
                    </li>
                  );
                }
                if (i.source === "google") {
                  return (
                    <li
                      key={`google-${i.id}`}
                      className="truncate text-[12px] text-ds-text-3"
                      title={i.calendarName ? `${i.title} · ${i.calendarName}` : i.title}
                    >
                      <Link href={href}>
                        ◷ {i.allDay ? i.title : `${hhmm(i.start)} · ${i.title}`}
                      </Link>
                    </li>
                  );
                }
                if (i.allDay) {
                  return (
                    <li key={`${i.type}-${i.id}`} className="truncate text-[12px]">
                      <Link
                        href={href}
                        className="block rounded-md bg-tint-violet/60 px-1.5 py-0.5 text-tint-violet-fg"
                        title={`Licitación · ${i.title}`}
                      >
                        {i.title}
                      </Link>
                    </li>
                  );
                }
                return (
                  <li key={`${i.type}-${i.id}`} className="truncate text-[12px] text-ds-text-2">
                    <Link href={href}>
                      {hhmm(i.start)} · {i.title}
                    </Link>
                  </li>
                );
              })}
              {dayItems.length === 0 && (
                <li>
                  <Link
                    href={hubAgendaDayHref(dayKey)}
                    className="text-[12px] text-ds-text-4 hover:text-primary"
                  >
                    —
                  </Link>
                </li>
              )}
            </ul>
          </div>
        );
      })}
    </div>
  );
}
