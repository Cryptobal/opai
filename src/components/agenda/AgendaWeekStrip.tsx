"use client";

import { addDaysChile, startOfDayChile, todayInChile, ymdInChile } from "@/lib/dates-cl";
import { AgendaDayColumn } from "./AgendaDayColumn";

export type WeekItem = {
  id: string;
  source: string;
  type: string;
  title: string;
  start: string;
  end?: string | null;
  allDay: boolean;
  syncStatus: string | null;
  dealId?: string | null;
  assignedUserId?: string | null;
  htmlLink?: string | null;
  calendarName?: string | null;
  href?: string | null;
};

type Props = {
  weekStart: Date;
  items: WeekItem[];
  compact?: boolean;
  days?: number;
  onVisitClick?: (item: WeekItem) => void;
  onLicClick?: (item: WeekItem) => void;
  onTaskClick?: (item: WeekItem) => void;
  onTaskDrop?: (taskId: string, day: Date) => void;
  onVisitDrop?: (visitaId: string, day: Date) => void;
};

export function AgendaWeekStrip({
  weekStart,
  items,
  compact,
  days = 7,
  onVisitClick,
  onLicClick,
  onTaskClick,
  onTaskDrop,
  onVisitDrop,
}: Props) {
  const todayKey = todayInChile();
  const cols = Array.from({ length: days }, (_, i) =>
    addDaysChile(startOfDayChile(weekStart), i),
  );

  return (
    <div
      className={`grid gap-2 ${
        compact ? "grid-cols-4 sm:grid-cols-7" : "grid-cols-1 sm:grid-cols-7"
      }`}
    >
      {cols.map((day) => {
        const key = ymdInChile(day);
        const dayItems = items.filter((i) => ymdInChile(new Date(i.start)) === key);
        return (
          <AgendaDayColumn
            key={key}
            day={day}
            items={dayItems}
            isToday={key === todayKey}
            onVisitClick={onVisitClick}
            onLicClick={onLicClick}
            onTaskClick={onTaskClick}
            onTaskDrop={onTaskDrop}
            onVisitDrop={onVisitDrop}
          />
        );
      })}
    </div>
  );
}
