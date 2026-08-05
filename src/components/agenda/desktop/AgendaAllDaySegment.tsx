"use client";

import { cn } from "@/lib/utils";
import {
  paletteBorder,
  paletteFgText,
  paletteSoftBg,
} from "@/lib/design/calendar-palette";
import { AgendaCompactEvent } from "../AgendaEventCard";
import { isMovableAgendaItem, type AllDaySegment } from "../agenda-calendar-utils";
import type { AgendaCalendarItem, AgendaTeamMember } from "../agenda-calendar.types";
import { itemSourceKey } from "./agenda-desktop-prefs";

type Props = {
  segment: AllDaySegment;
  selected: boolean;
  user?: AgendaTeamMember;
  showOwner: boolean;
  colorBySource?: Record<string, string>;
  onSelect: (item: AgendaCalendarItem) => void;
};

/** Chip/barra de un segmento all-day (multi-día o compacto arrastrable). */
export function AgendaAllDaySegmentChip({
  segment,
  selected,
  user,
  showOwner,
  colorBySource,
  onSelect,
}: Props) {
  const { item, startIndex, endIndex, continuesBefore, continuesAfter, isEntregaEnd } =
    segment;

  if (
    isMovableAgendaItem(item) &&
    startIndex === endIndex &&
    !continuesBefore &&
    !continuesAfter
  ) {
    return (
      <div style={{ gridColumn: `${startIndex + 1} / ${endIndex + 2}` }} className="min-w-0">
        <AgendaCompactEvent
          item={item}
          dense
          selected={selected}
          user={user}
          showOwner={showOwner}
          className="h-[22px] min-h-0 min-w-0 rounded sm:h-[22px]"
          colorBySource={colorBySource}
          onSelect={onSelect}
        />
      </div>
    );
  }

  const sk = itemSourceKey(item);
  const tint = colorBySource?.[sk];
  const tone = tint
    ? cn(paletteSoftBg(tint), paletteFgText(tint), "border", paletteBorder(tint))
    : "bg-tint-violet text-tint-violet-fg border-tint-violet-fg/30";

  return (
    <button
      type="button"
      onClick={(e) => {
        e.stopPropagation();
        onSelect(item);
      }}
      title={item.title}
      style={{ gridColumn: `${startIndex + 1} / ${endIndex + 2}` }}
      className={cn(
        "pointer-events-auto flex h-[22px] min-w-0 items-center gap-1 overflow-hidden border px-1.5 text-left text-[12px] font-medium shadow-ds-xs",
        !continuesBefore && "rounded-l-md",
        !continuesAfter && "rounded-r-md",
        isEntregaEnd && "border-r-2 border-r-primary",
        selected && "ring-2 ring-primary/35",
        tone,
      )}
    >
      {continuesBefore && (
        <span aria-hidden className="shrink-0 opacity-80">
          ◀
        </span>
      )}
      <span className="truncate">{item.title}</span>
      {continuesAfter && (
        <span aria-hidden className="ml-auto shrink-0 opacity-80">
          ▶
        </span>
      )}
    </button>
  );
}
