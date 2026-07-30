"use client";

import { useEffect, useState } from "react";
import { ChevronLeft, ChevronRight } from "lucide-react";
import { CHILE_TZ, isoWeekChile, todayInChile, ymdInChile } from "@/lib/dates-cl";
import { cn } from "@/lib/utils";
import {
  addMonthsChile,
  monthGridDays,
  startOfMonthChile,
} from "../agenda-calendar-utils";

type Props = {
  anchor: Date;
  /** Ymd de los días visibles en la grilla principal (fondo primary/8). */
  visibleDays: Set<string>;
  onSelectDate: (ymd: string) => void;
};

const DOW = ["L", "M", "M", "J", "V", "S", "D"];

/** Mini-calendario mensual del rail, con columna de Nº de semana ISO. */
export function AgendaMiniCalendar({ anchor, visibleDays, onSelectDate }: Props) {
  const [month, setMonth] = useState(() => startOfMonthChile(anchor));
  useEffect(() => {
    setMonth(startOfMonthChile(anchor));
  }, [anchor]);

  const days = monthGridDays(month);
  const monthKey = ymdInChile(month).slice(0, 7);
  const today = todayInChile();
  const monthLabel = month
    .toLocaleDateString("es-CL", { month: "long", year: "numeric", timeZone: CHILE_TZ })
    .replace(" de ", " ");
  const weeks = Array.from({ length: 6 }, (_, i) => days.slice(i * 7, i * 7 + 7));

  return (
    <div className="space-y-1.5">
      <div className="flex items-center justify-between px-1">
        <p className="text-ds-body font-semibold capitalize text-ds-text-1">{monthLabel}</p>
        <div className="flex items-center">
          <button
            type="button"
            aria-label="Mes anterior"
            onClick={() => setMonth((m) => addMonthsChile(m, -1))}
            className="inline-flex h-7 w-7 items-center justify-center rounded-lg text-ds-text-3 hover:bg-ds-surface-2 ds-tap"
          >
            <ChevronLeft className="h-3.5 w-3.5" />
          </button>
          <button
            type="button"
            aria-label="Mes siguiente"
            onClick={() => setMonth((m) => addMonthsChile(m, 1))}
            className="inline-flex h-7 w-7 items-center justify-center rounded-lg text-ds-text-3 hover:bg-ds-surface-2 ds-tap"
          >
            <ChevronRight className="h-3.5 w-3.5" />
          </button>
        </div>
      </div>

      <div className="grid grid-cols-[20px_repeat(7,1fr)] gap-y-0.5 text-center">
        <span className="font-mono text-[12px] text-ds-text-4/60">#</span>
        {DOW.map((d, i) => (
          <span key={`${d}-${i}`} className="text-[12px] font-medium text-ds-text-4">
            {d}
          </span>
        ))}
        {weeks.map((week) => (
          <MiniWeekRow
            key={ymdInChile(week[0])}
            week={week}
            monthKey={monthKey}
            today={today}
            visibleDays={visibleDays}
            onSelectDate={onSelectDate}
          />
        ))}
      </div>
    </div>
  );
}

function MiniWeekRow({
  week,
  monthKey,
  today,
  visibleDays,
  onSelectDate,
}: {
  week: Date[];
  monthKey: string;
  today: string;
  visibleDays: Set<string>;
  onSelectDate: (ymd: string) => void;
}) {
  return (
    <>
      <span className="flex items-center justify-center font-mono text-[12px] text-ds-text-4/60">
        {isoWeekChile(week[0])}
      </span>
      {week.map((day) => {
        const key = ymdInChile(day);
        const inVisibleRange = visibleDays.has(key);
        const muted = key.slice(0, 7) !== monthKey;
        const isToday = key === today;
        return (
          <button
            key={key}
            type="button"
            onClick={() => onSelectDate(key)}
            className={cn(
              "mx-auto inline-flex h-6 w-6 items-center justify-center rounded-full text-[12px] transition-colors ds-tap",
              isToday
                ? "bg-primary font-semibold text-primary-foreground"
                : inVisibleRange
                  ? "bg-primary/[0.08] text-ds-text-1"
                  : muted
                    ? "text-ds-text-4/70 hover:bg-ds-surface-2"
                    : "text-ds-text-2 hover:bg-ds-surface-2",
            )}
          >
            {Number(key.slice(8, 10))}
          </button>
        );
      })}
    </>
  );
}
