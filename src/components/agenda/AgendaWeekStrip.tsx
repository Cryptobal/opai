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
  assignedUserId?: string | null;
};

type Props = {
  weekStart: Date;
  items: WeekItem[];
  compact?: boolean;
  days?: number;
  onVisitClick?: (item: WeekItem) => void;
  onLicClick?: (item: WeekItem) => void;
};

function startOfDay(d: Date) {
  const x = new Date(d);
  x.setHours(0, 0, 0, 0);
  return x;
}

export function AgendaWeekStrip({
  weekStart,
  items,
  compact,
  days = 7,
  onVisitClick,
  onLicClick,
}: Props) {
  const today = startOfDay(new Date()).getTime();
  const cols = Array.from({ length: days }, (_, i) => {
    const d = startOfDay(weekStart);
    d.setDate(d.getDate() + i);
    return d;
  });

  return (
    <div
      className={`grid gap-2 ${
        compact ? "grid-cols-4 sm:grid-cols-7" : "grid-cols-1 sm:grid-cols-7"
      }`}
    >
      {cols.map((day) => {
        const key = day.toDateString();
        const dayItems = items.filter((i) => new Date(i.start).toDateString() === key);
        return (
          <AgendaDayColumn
            key={key}
            day={day}
            items={dayItems}
            isToday={day.getTime() === today}
            onVisitClick={onVisitClick}
            onLicClick={onLicClick}
          />
        );
      })}
    </div>
  );
}
