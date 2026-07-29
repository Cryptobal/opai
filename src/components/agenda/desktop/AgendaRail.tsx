"use client";

import { cn } from "@/lib/utils";
import { AgendaCalendarList, type CalendarSource } from "./AgendaCalendarList";
import { AgendaMiniCalendar } from "./AgendaMiniCalendar";

type Props = {
  collapsed: boolean;
  anchor: Date;
  visibleDays: Set<string>;
  sources: CalendarSource[];
  counts: Record<string, number>;
  onSelectDate: (ymd: string) => void;
  onToggleSource: (sourceKey: string) => void;
  onColorChange: (sourceKey: string, color: string) => void;
  onSetCreateTarget?: (sourceKey: string) => void;
};

/** Rail izquierdo (232px) colapsable: mini-calendario + lista de calendarios. */
export function AgendaRail({
  collapsed,
  anchor,
  visibleDays,
  sources,
  counts,
  onSelectDate,
  onToggleSource,
  onColorChange,
  onSetCreateTarget,
}: Props) {
  return (
    <div
      className={cn(
        "shrink-0 overflow-hidden transition-[width] duration-150",
        collapsed ? "w-0" : "w-[232px]",
      )}
      aria-hidden={collapsed}
    >
      <div className="flex h-full w-[232px] min-w-[232px] flex-col gap-4 overflow-y-auto pr-2 pt-1">
        <AgendaMiniCalendar
          anchor={anchor}
          visibleDays={visibleDays}
          onSelectDate={onSelectDate}
        />
        <AgendaCalendarList
          sources={sources}
          counts={counts}
          onToggle={onToggleSource}
          onColorChange={onColorChange}
          onSetCreateTarget={onSetCreateTarget}
        />
      </div>
    </div>
  );
}
