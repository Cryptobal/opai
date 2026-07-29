"use client";

import { useMemo } from "react";
import { ChevronLeft, ChevronRight } from "lucide-react";
import { cn } from "@/lib/utils";
import { todayInChile, ymdInChile } from "@/lib/dates-cl";
import {
  addMonthsChile,
  agendaItemDayKey,
  dateAtChileSlot,
  monthGridDays,
} from "../agenda-calendar-utils";
import type { AgendaCalendarItem } from "../agenda-calendar.types";
import { monthTitle, typeBarClass } from "./agenda-mobile-utils";
import { AgendaListRow } from "./AgendaListRow";

const WEEKDAYS = ["L", "M", "M", "J", "V", "S", "D"];

type Props = {
  selectedYmd: string;
  items: AgendaCalendarItem[];
  colorBySource?: Record<string, string>;
  onSelectDate: (ymd: string) => void;
  onSelect: (item: AgendaCalendarItem) => void;
  onChanged: () => void;
};

/** Vista Mes móvil (spec §5): grid 7 col fluido sin scroll-x + panel del día. */
export function AgendaMonthView({
  selectedYmd,
  items,
  colorBySource,
  onSelectDate,
  onSelect,
  onChanged,
}: Props) {
  const anchor = useMemo(() => dateAtChileSlot(selectedYmd, 720), [selectedYmd]);
  const days = useMemo(() => monthGridDays(anchor), [anchor]);
  const today = todayInChile();
  const monthPrefix = selectedYmd.slice(0, 7);
  const { month, year } = monthTitle(selectedYmd);

  const byDay = useMemo(() => {
    const map = new Map<string, AgendaCalendarItem[]>();
    for (const item of items) {
      const key = agendaItemDayKey(item);
      if (!map.has(key)) map.set(key, []);
      map.get(key)!.push(item);
    }
    for (const list of map.values()) list.sort((a, b) => a.start.localeCompare(b.start));
    return map;
  }, [items]);

  const dayItems = byDay.get(selectedYmd) ?? [];
  const shiftMonth = (dir: -1 | 1) => onSelectDate(ymdInChile(addMonthsChile(anchor, dir)));

  return (
    <div className="space-y-3 pb-28 pt-2">
      <div className="flex items-center justify-center gap-3">
        <button type="button" aria-label="Mes anterior" onClick={() => shiftMonth(-1)} className="flex h-11 w-11 items-center justify-center rounded-xl text-ds-text-3 ds-tap">
          <ChevronLeft className="h-5 w-5" />
        </button>
        <p className="text-[14px] font-semibold text-ds-text-1">
          {month} <span className="font-mono text-[12px] text-ds-text-3">{year}</span>
        </p>
        <button type="button" aria-label="Mes siguiente" onClick={() => shiftMonth(1)} className="flex h-11 w-11 items-center justify-center rounded-xl text-ds-text-3 ds-tap">
          <ChevronRight className="h-5 w-5" />
        </button>
      </div>

      <div className="grid grid-cols-7 gap-1">
        {WEEKDAYS.map((w, i) => (
          <p key={`${w}-${i}`} className="text-center text-[12px] font-medium uppercase text-ds-text-4">
            {w}
          </p>
        ))}
        {days.map((day) => {
          const ymd = ymdInChile(day);
          const inMonth = ymd.startsWith(monthPrefix);
          const selected = ymd === selectedYmd;
          const isToday = ymd === today;
          const dots = (byDay.get(ymd) ?? []).slice(0, 3);
          return (
            <button
              key={ymd}
              type="button"
              onClick={() => onSelectDate(ymd)}
              className={cn(
                "flex aspect-square min-h-11 flex-col items-center justify-center gap-0.5 rounded-[13px] ds-tap",
                selected
                  ? "bg-primary text-primary-foreground"
                  : isToday
                    ? "border border-primary/50 text-ds-text-1"
                    : "opai-glass-soft",
                !inMonth && !selected && "opacity-40",
              )}
            >
              <span className="font-mono text-[13px] leading-none">{Number(ymd.slice(8))}</span>
              <span className="flex h-1 items-center gap-0.5">
                {dots.map((item, i) => (
                  <span
                    key={i}
                    className={cn(
                      "h-1 w-1 rounded-full",
                      selected ? "bg-primary-foreground" : typeBarClass(item, colorBySource),
                    )}
                  />
                ))}
              </span>
            </button>
          );
        })}
      </div>

      <section className="opai-glass space-y-2 rounded-[22px] p-3">
        <p className="font-display text-[14px] font-semibold text-ds-text-1">
          Agenda del día{" "}
          <span className="font-mono text-[12px] font-normal text-ds-text-3">
            {selectedYmd.slice(8)}/{selectedYmd.slice(5, 7)} · {dayItems.length} evento
            {dayItems.length === 1 ? "" : "s"}
          </span>
        </p>
        {dayItems.length === 0 ? (
          <p className="py-3 text-center text-[13px] text-ds-text-4">Día libre</p>
        ) : (
          <div className="space-y-2">
            {dayItems.map((item) => (
              <AgendaListRow
                key={`${item.source}:${item.id}`}
                item={item}
                colorBySource={colorBySource}
                onSelect={onSelect}
                onChanged={onChanged}
              />
            ))}
          </div>
        )}
      </section>
    </div>
  );
}
