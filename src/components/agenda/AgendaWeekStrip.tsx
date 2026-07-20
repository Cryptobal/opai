"use client";

import { AgendaDayColumn } from "./AgendaDayColumn";

export type WeekItem = {
  id: string;
  source: string;
  type: string;
  title: string;
  start: string;
  allDay: boolean;
  syncStatus: string | null;
  dealId?: string | null;
};

type Props = {
  weekStart: Date;
  items: WeekItem[];
  compact?: boolean;
  onDayClick?: (day: Date) => void;
  onVisitClick?: (item: WeekItem) => void;
  onLicClick?: (item: WeekItem) => void;
};

function startOfDay(d: Date) {
  const x = new Date(d);
  x.setHours(0, 0, 0, 0);
  return x;
}

/** Semana comercial: 7 columnas (día actual resaltado con primary). */
export function AgendaWeekStrip({
  weekStart,
  items,
  compact,
  onDayClick,
  onVisitClick,
  onLicClick,
}: Props) {
  const today = startOfDay(new Date()).getTime();
  const days = Array.from({ length: 7 }, (_, i) => {
    const d = startOfDay(weekStart);
    d.setDate(d.getDate() + i);
    return d;
  });

  return (
    <div className={`grid gap-2 ${compact ? "grid-cols-4 sm:grid-cols-7" : "grid-cols-1 sm:grid-cols-7"}`}>
      {days.map((day) => {
        const key = day.toDateString();
        const isToday = day.getTime() === today;
        const dayItems = items.filter((i) => new Date(i.start).toDateString() === key);
        return (
          <AgendaDayColumn
            key={key}
            day={day}
            items={dayItems}
            isToday={isToday}
            onHeaderClick={onDayClick ? () => onDayClick(day) : undefined}
            onVisitClick={onVisitClick}
            onLicClick={onLicClick}
          />
        );
      })}
    </div>
  );
}
