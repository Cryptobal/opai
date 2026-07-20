"use client";

import type { WeekItem } from "./AgendaWeekStrip";

type Props = {
  items: WeekItem[];
  onSelect?: (item: WeekItem) => void;
};

export function VisitList({ items, onSelect }: Props) {
  const upcoming = items
    .filter((i) => !i.allDay && new Date(i.start) >= new Date())
    .slice(0, 12);

  if (upcoming.length === 0) {
    return (
      <p className="text-[13px] text-ds-text-3">
        Sin visitas esta semana — agenda la primera.
      </p>
    );
  }

  return (
    <ul className="divide-y divide-ds-border-subtle rounded-xl border border-ds-border-subtle">
      {upcoming.map((i) => (
        <li key={`${i.source}-${i.id}`}>
          <button
            type="button"
            onClick={() => onSelect?.(i)}
            className="flex w-full items-center justify-between gap-2 px-3 py-2.5 text-left ds-tap"
          >
            <div className="min-w-0">
              <p className="truncate text-[13px] text-ds-text-1">{i.title}</p>
              <p className="text-[12px] text-ds-text-4">
                {new Date(i.start).toLocaleString("es-CL")} · {i.type}
              </p>
            </div>
            <span className="text-[12px] text-ds-text-3">{i.syncStatus || "—"}</span>
          </button>
        </li>
      ))}
    </ul>
  );
}
