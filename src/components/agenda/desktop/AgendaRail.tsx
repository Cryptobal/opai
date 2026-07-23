"use client";

import { cn } from "@/lib/utils";
import type { AgendaSourceKey } from "./agenda-desktop-prefs";
import { AgendaCalendarToggles } from "./AgendaCalendarToggles";
import { AgendaMiniCalendar } from "./AgendaMiniCalendar";
import type { GoogleAccountStatus } from "./useAgendaDesktopData";

type Props = {
  collapsed: boolean;
  anchor: Date;
  visibleDays: Set<string>;
  hiddenSources: AgendaSourceKey[];
  counts: Partial<Record<AgendaSourceKey, number>>;
  google: GoogleAccountStatus | null;
  onSelectDate: (ymd: string) => void;
  onToggleSource: (key: AgendaSourceKey) => void;
};

/** Rail izquierdo (232px) colapsable: mini-calendario + toggles de calendarios. */
export function AgendaRail({
  collapsed,
  anchor,
  visibleDays,
  hiddenSources,
  counts,
  google,
  onSelectDate,
  onToggleSource,
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
        <AgendaCalendarToggles
          hiddenSources={hiddenSources}
          onToggleSource={onToggleSource}
          counts={counts}
          google={google}
        />
      </div>
    </div>
  );
}
