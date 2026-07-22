"use client";

import Link from "next/link";
import { ymdInChile } from "@/lib/dates-cl";
import { agendaItemDayKey } from "./agenda-calendar-utils";
import { type HubAgendaItem, hhmm } from "./agenda-hub-item";

/** Grilla de próximos días del hub (hoy+1 en adelante), con eventos Google. */
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
    <div className={`grid gap-2 ${expanded ? "grid-cols-2 sm:grid-cols-7" : "grid-cols-3"}`}>
      {days.slice(1).map((d) => {
        const dayKey = ymdInChile(d);
        const dayItems = items.filter((i) => agendaItemDayKey(i) === dayKey);
        return (
          <div key={dayKey} className="rounded-xl border border-ds-border-subtle p-2">
            <p className="mb-1 text-[12px] font-medium text-ds-text-3">
              {d.toLocaleDateString("es-CL", {
                weekday: "short",
                day: "numeric",
                timeZone: "America/Santiago",
              })}
            </p>
            <ul className="space-y-1">
              {dayItems.slice(0, 3).map((i) =>
                i.source === "tarea" ? (
                  <li key={`tarea-${i.id}`} className="truncate text-[12px]">
                    <Link href={i.href || "/crm/mi-semana"} className="text-primary">
                      ✓ {i.allDay ? i.title : `${hhmm(i.start)} · ${i.title}`}
                    </Link>
                  </li>
                ) : i.source === "google" ? (
                  <li
                    key={`google-${i.id}`}
                    className="truncate text-[12px] text-ds-text-3"
                    title={i.calendarName ? `${i.title} · ${i.calendarName}` : i.title}
                  >
                    <a href={i.htmlLink || undefined} target="_blank" rel="noopener noreferrer">
                      ◷ {i.allDay ? i.title : `${hhmm(i.start)} · ${i.title}`}
                    </a>
                  </li>
                ) : i.allDay ? (
                  <li
                    key={`${i.type}-${i.id}`}
                    className="truncate rounded-md bg-tint-violet/60 px-1.5 py-0.5 text-[12px] text-tint-violet-fg"
                    title={`Licitación · ${i.title}`}
                  >
                    {i.title}
                  </li>
                ) : (
                  <li key={`${i.type}-${i.id}`} className="truncate text-[12px] text-ds-text-2">
                    {hhmm(i.start)} · {i.title}
                  </li>
                ),
              )}
              {dayItems.length === 0 && <li className="text-[12px] text-ds-text-4">—</li>}
            </ul>
          </div>
        );
      })}
    </div>
  );
}
