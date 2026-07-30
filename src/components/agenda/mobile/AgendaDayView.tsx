"use client";

import { useEffect, useMemo, useRef } from "react";
import { ChevronLeft, ChevronRight } from "lucide-react";
import { cn } from "@/lib/utils";
import { addDaysChile, todayInChile, ymdInChile } from "@/lib/dates-cl";
import {
  dateAtChileSlot,
  layoutTimedItems,
  minutesInChile,
} from "../agenda-calendar-utils";
import type { AgendaCalendarItem } from "../agenda-calendar.types";
import { dayParts, hhmmChile, monthTitle, typeBarClass } from "./agenda-mobile-utils";

const HOUR_H = 64; // px por hora (spec §4)

type Props = {
  selectedYmd: string;
  items: AgendaCalendarItem[];
  colorBySource?: Record<string, string>;
  onSelectDate: (ymd: string) => void;
  onSelect: (item: AgendaCalendarItem) => void;
};

/** Vista Día móvil (spec §4): 1 columna 00-24, nowline, swipe entre días. */
export function AgendaDayView({
  selectedYmd,
  items,
  colorBySource,
  onSelectDate,
  onSelect,
}: Props) {
  const isToday = selectedYmd === todayInChile();
  const scrollAnchor = useRef<HTMLDivElement>(null);
  const touchStart = useRef<{ x: number; y: number } | null>(null);

  const layout = useMemo(() => layoutTimedItems(items), [items]);
  const allDay = items.filter((i) => i.allDay);
  const nowMinute = isToday ? minutesInChile(new Date()) : null;

  // Auto-scroll inicial: primer evento o 08:00.
  useEffect(() => {
    const firstMinute = layout.length
      ? Math.min(...layout.map((l) => l.startMinute))
      : 8 * 60;
    const y = Math.max(0, (firstMinute / 60) * HOUR_H - 24);
    const base = scrollAnchor.current?.getBoundingClientRect().top ?? 0;
    window.scrollTo({ top: window.scrollY + base + y - 170, behavior: "auto" });
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [selectedYmd]);

  const shift = (dir: -1 | 1) =>
    onSelectDate(ymdInChile(addDaysChile(dateAtChileSlot(selectedYmd, 720), dir)));

  const { weekday, day } = dayParts(selectedYmd);
  const { month } = monthTitle(selectedYmd);

  return (
    <div
      className="pb-28 pt-2"
      onTouchStart={(e) => {
        touchStart.current = { x: e.touches[0].clientX, y: e.touches[0].clientY };
      }}
      onTouchEnd={(e) => {
        const start = touchStart.current;
        touchStart.current = null;
        if (!start) return;
        const dx = e.changedTouches[0].clientX - start.x;
        const dy = e.changedTouches[0].clientY - start.y;
        if (Math.abs(dx) > 60 && Math.abs(dx) > Math.abs(dy) * 1.5) {
          shift(dx < 0 ? 1 : -1);
        }
      }}
    >
      <div className="mb-2 flex items-center justify-center gap-3">
        <button type="button" aria-label="Día anterior" onClick={() => shift(-1)} className="flex h-11 w-11 items-center justify-center rounded-xl text-ds-text-3 ds-tap">
          <ChevronLeft className="h-5 w-5" />
        </button>
        <p className="text-[14px] font-semibold capitalize text-ds-text-1">
          {weekday} {day} {month.toLowerCase()}
        </p>
        <button type="button" aria-label="Día siguiente" onClick={() => shift(1)} className="flex h-11 w-11 items-center justify-center rounded-xl text-ds-text-3 ds-tap">
          <ChevronRight className="h-5 w-5" />
        </button>
      </div>

      {allDay.length > 0 && (
        <div className="mb-2 space-y-1.5">
          {allDay.map((item) => (
            <button
              key={`${item.source}:${item.id}`}
              type="button"
              onClick={() => onSelect(item)}
              className="opai-glass-soft flex w-full items-center gap-2 rounded-[16px] px-3 py-2 text-left ds-tap"
            >
              <span className={cn("h-4 w-[3px] rounded-full", typeBarClass(item, colorBySource))} />
              <span className="truncate text-ds-body font-medium text-ds-text-1">{item.title}</span>
            </button>
          ))}
        </div>
      )}

      <div ref={scrollAnchor} className="relative" style={{ height: 24 * HOUR_H }}>
        {Array.from({ length: 24 }, (_, h) => (
          <div
            key={h}
            className="absolute inset-x-0 border-t border-ds-border-subtle"
            style={{ top: h * HOUR_H }}
          >
            <span className="absolute -top-2 left-0 w-9 font-mono text-[12px] text-ds-text-4">
              {String(h).padStart(2, "0")}
            </span>
          </div>
        ))}

        {layout.map(({ item, startMinute, endMinute, column, columnCount }) => {
          return (
            <button
              key={`${item.source}:${item.id}`}
              type="button"
              onClick={() => onSelect(item)}
              className="opai-glass-soft absolute overflow-hidden rounded-[14px] px-2.5 py-1.5 text-left ds-tap"
              style={{
                top: (startMinute / 60) * HOUR_H + 1,
                height: Math.max(44, ((endMinute - startMinute) / 60) * HOUR_H - 2),
                left: `calc(44px + ${column} * ((100% - 44px) / ${columnCount}))`,
                width: `calc((100% - 44px) / ${columnCount} - 4px)`,
              }}
            >
              <span className={cn("absolute inset-y-0 left-0 w-[3px]", typeBarClass(item, colorBySource))} />
              <p className="truncate text-ds-body font-semibold leading-tight text-ds-text-1">
                {item.title}
              </p>
              <p className="font-mono text-[12px] text-ds-text-3">
                {hhmmChile(item.start)}–{hhmmChile(item.end)}
              </p>
            </button>
          );
        })}

        {nowMinute != null && (
          <div
            className="pointer-events-none absolute inset-x-0 z-10"
            style={{ top: (nowMinute / 60) * HOUR_H }}
          >
            <div className="relative border-t-2 border-status-danger">
              <span className="absolute -left-0 -top-[5px] h-2 w-2 rounded-full bg-status-danger" />
              <span className="absolute right-0 -top-[9px] rounded bg-status-danger px-1 font-mono text-[12px] leading-4 text-white">
                {String(Math.floor(nowMinute / 60)).padStart(2, "0")}:
                {String(nowMinute % 60).padStart(2, "0")}
              </span>
            </div>
          </div>
        )}
      </div>
    </div>
  );
}
