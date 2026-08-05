"use client";

import { ChevronDown, ChevronUp } from "lucide-react";
import { useDroppable } from "@dnd-kit/core";
import { cn } from "@/lib/utils";
import { buildAllDayLanes, itemKey } from "../agenda-calendar-utils";
import type { AgendaCalendarItem, AgendaTeamMember } from "../agenda-calendar.types";
import { AgendaAllDaySegmentChip } from "./AgendaAllDaySegment";

const LANE_H = 22;
const LANE_GAP = 2;
const COLLAPSED_LANES = 3;
const HARD_CAP_LANES = 8;

type Props = {
  days: Date[];
  dayKeys: string[];
  columns: string;
  items: AgendaCalendarItem[];
  selectedKey: string | null;
  usersById: Map<string, AgendaTeamMember>;
  showOwner: boolean;
  expanded: boolean;
  colorBySource?: Record<string, string>;
  onSelect: (item: AgendaCalendarItem) => void;
  onExpandedChange: (expanded: boolean) => void;
};

/** Franja all-day con bandas multi-día continuas (carriles horizontales). */
export function AgendaAllDayBand({
  days,
  dayKeys,
  columns,
  items,
  selectedKey,
  usersById,
  showOwner,
  expanded,
  colorBySource,
  onSelect,
  onExpandedChange,
}: Props) {
  const allDayItems = items.filter((i) => i.allDay);
  const lanes = buildAllDayLanes(allDayItems, dayKeys);
  const visibleCount = expanded
    ? Math.min(lanes.length, HARD_CAP_LANES)
    : Math.min(lanes.length, COLLAPSED_LANES);
  const visibleLanes = lanes.slice(0, visibleCount);
  const hiddenCount = lanes.length - visibleCount;
  const canToggle = lanes.length > COLLAPSED_LANES;
  const contentH =
    Math.max(1, visibleCount) * (LANE_H + LANE_GAP) + 8 + (hiddenCount > 0 ? 18 : 0);

  return (
    <div
      className="relative border-t border-ds-border-subtle"
      style={{ minHeight: contentH }}
      data-agenda-allday-band
    >
      <div
        className="pointer-events-none absolute inset-0 z-10 grid"
        style={{ gridTemplateColumns: columns }}
        aria-hidden
      >
        <div className="border-r border-ds-border-subtle" />
        {dayKeys.map((key) => (
          <AllDayDropColumn key={`drop-${key}`} dateKey={key} />
        ))}
      </div>

      <div className="grid" style={{ gridTemplateColumns: columns }}>
        <div className="relative z-20 flex flex-col items-end justify-start gap-1 border-r border-ds-border-subtle px-1 py-1.5">
          <span className="text-right text-[12px] leading-tight text-ds-text-4">
            Todo el día
          </span>
          {canToggle && (
            <button
              type="button"
              aria-expanded={expanded}
              aria-label={expanded ? "Colapsar todo el día" : "Expandir todo el día"}
              onClick={() => onExpandedChange(!expanded)}
              className="inline-flex h-11 w-11 items-center justify-center rounded-lg text-ds-text-3 hover:bg-ds-surface-3 ds-tap sm:h-9 sm:w-9"
            >
              {expanded ? (
                <ChevronUp className="h-4 w-4" />
              ) : (
                <ChevronDown className="h-4 w-4" />
              )}
            </button>
          )}
        </div>

        <div
          className="relative z-20 min-w-0 space-y-0.5 px-0.5 py-1"
          style={{ gridColumn: `2 / ${days.length + 2}` }}
        >
          {visibleLanes.map((lane, laneIdx) => (
            <div
              key={`lane-${laneIdx}`}
              className="grid"
              style={{
                gridTemplateColumns: `repeat(${dayKeys.length}, minmax(0, 1fr))`,
                height: LANE_H,
                gap: 2,
              }}
            >
              {lane.segments.map((seg) => (
                <AgendaAllDaySegmentChip
                  key={itemKey(seg.item)}
                  segment={seg}
                  selected={selectedKey === itemKey(seg.item)}
                  user={usersById.get(seg.item.assignedUserId)}
                  showOwner={showOwner}
                  colorBySource={colorBySource}
                  onSelect={onSelect}
                />
              ))}
            </div>
          ))}
          {hiddenCount > 0 && (
            <p className="px-1 text-[12px] font-medium text-ds-text-3">
              +{hiddenCount} más
              {!expanded && canToggle ? " · expandir" : ""}
            </p>
          )}
        </div>
      </div>
    </div>
  );
}

function AllDayDropColumn({ dateKey }: { dateKey: string }) {
  const { setNodeRef, isOver } = useDroppable({ id: `all-day:${dateKey}` });
  return (
    <div
      ref={setNodeRef}
      data-agenda-allday={dateKey}
      className={cn(
        "pointer-events-auto min-w-0 border-r border-ds-border-subtle",
        isOver && "bg-primary/5",
      )}
    />
  );
}
