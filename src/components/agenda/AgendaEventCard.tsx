"use client";

import { useRef, useState, type CSSProperties, type PointerEvent } from "react";
import { useDraggable } from "@dnd-kit/core";
import { CSS } from "@dnd-kit/utilities";
import { ExternalLink, GripHorizontal } from "lucide-react";
import { syncStatusMeta } from "./agenda-sync-status";
import { Avatar } from "@/components/opai-ds";
import {
  paletteBorder,
  paletteFgText,
  paletteSoftBg,
} from "@/lib/design/calendar-palette";
import { cn } from "@/lib/utils";
import { itemSourceKey } from "./desktop/agenda-desktop-prefs";
import {
  CALENDAR_HOUR_HEIGHT,
  eventDurationMinutes,
  formatAgendaTime,
  isMovableAgendaItem,
  isResizableAgendaItem,
  itemKey,
  resizedSchedule,
} from "./agenda-calendar-utils";
import type {
  AgendaCalendarItem,
  AgendaSchedule,
  AgendaTeamMember,
} from "./agenda-calendar.types";

type TimedProps = {
  item: AgendaCalendarItem;
  top: number;
  height: number;
  left: number;
  width: number;
  selected: boolean;
  user?: AgendaTeamMember;
  hourHeight?: number;
  step?: number;
  showOwner?: boolean;
  colorBySource?: Record<string, string>;
  onSelect: (item: AgendaCalendarItem) => void;
  onResize: (item: AgendaCalendarItem, schedule: AgendaSchedule) => void;
};

export function AgendaTimedEvent({
  item,
  top,
  height,
  left,
  width,
  selected,
  user,
  hourHeight = CALENDAR_HOUR_HEIGHT,
  step = 15,
  showOwner = true,
  colorBySource,
  onSelect,
  onResize,
}: TimedProps) {
  const movable = isMovableAgendaItem(item);
  const resizable = isResizableAgendaItem(item);
  const [resizeDelta, setResizeDelta] = useState<number | null>(null);
  const resizeOrigin = useRef<{ y: number } | null>(null);
  const { attributes, listeners, setNodeRef, transform, isDragging } = useDraggable({
    id: itemKey(item),
    disabled: !movable,
    data: { item },
  });

  const previewSchedule =
    resizeDelta == null ? null : resizedSchedule(item, resizeDelta, hourHeight, step);
  const previewHeight = previewSchedule
    ? Math.max(
        44,
        ((previewSchedule.end.getTime() - previewSchedule.start.getTime()) / 60_000 / 60) *
          hourHeight,
      )
    : height;
  const assigneeName = item.assignedName ?? user?.name ?? null;
  const showDetails = previewHeight >= 68 && showOwner;

  const style: CSSProperties = {
    top,
    height: previewHeight,
    left: `calc(${left}% + 2px)`,
    width: `calc(${width}% - 4px)`,
    transform: CSS.Translate.toString(transform),
    zIndex: isDragging || resizeDelta != null ? 30 : selected ? 20 : 10,
  };

  const finishResize = (event: PointerEvent<HTMLButtonElement>) => {
    if (!resizeOrigin.current) return;
    const delta = event.clientY - resizeOrigin.current.y;
    resizeOrigin.current = null;
    setResizeDelta(null);
    const schedule = resizedSchedule(item, delta, hourHeight, step);
    if (schedule.end.toISOString() !== item.end) onResize(item, schedule);
  };

  return (
    <div
      ref={setNodeRef}
      style={style}
      className={cn(
        "group absolute min-h-11 select-none",
        isDragging && "opacity-25",
      )}
      data-agenda-event={itemKey(item)}
    >
      <button
        type="button"
        onClick={(event) => {
          event.stopPropagation();
          onSelect(item);
        }}
        className={cn(
          "relative h-full w-full overflow-hidden rounded-lg border px-2 py-1.5 text-left shadow-ds-xs transition-[border-color,background-color,box-shadow] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary/50",
          eventTone(item, colorBySource),
          movable && "cursor-grab active:cursor-grabbing touch-none",
          selected && "ring-2 ring-primary/35 shadow-ds-sm",
        )}
        aria-label={`${item.title}, ${formatAgendaTime(new Date(item.start))}`}
        {...listeners}
        {...attributes}
      >
        <span className="block truncate text-[13px] font-semibold leading-4">
          {item.title}
        </span>
        <span className="mt-0.5 flex min-w-0 items-center gap-1.5 text-[12px] leading-4 opacity-80">
          <span className="shrink-0">
            {formatAgendaTime(new Date(item.start))}–
            {formatAgendaTime(new Date(item.end))}
          </span>
          {item.source === "google" && <ExternalLink className="h-3 w-3 shrink-0" />}
          {(() => {
            const sync = syncStatusMeta(item.syncStatus, item.syncReason);
            if (!sync.icon || sync.status === "NONE") return null;
            const Icon = sync.icon;
            return (
              <Icon
                className={cn(
                  "h-3 w-3 shrink-0",
                  sync.tone === "ok" && "text-status-ok-fg",
                  sync.tone === "warn" && "text-status-warn-fg",
                  sync.tone === "danger" && "text-status-danger-fg",
                  sync.status === "PENDING" && "animate-spin",
                )}
                aria-label={sync.ariaLabel}
              />
            );
          })()}
        </span>
        {showDetails && assigneeName && (
          <span className="mt-1 flex min-w-0 items-center gap-1.5">
            <Avatar name={assigneeName} size="sm" variant="default" />
            <span className="truncate text-[12px] opacity-75">{assigneeName}</span>
          </span>
        )}
      </button>

      {resizable && selected && (
        <button
          type="button"
          aria-label={`Ajustar duración de ${item.title}`}
          className="absolute -bottom-[18px] left-0 right-0 z-40 flex h-11 cursor-ns-resize touch-none items-center justify-center sm:-bottom-2 sm:h-5"
          onPointerDown={(event) => {
            event.preventDefault();
            event.stopPropagation();
            resizeOrigin.current = { y: event.clientY };
            event.currentTarget.setPointerCapture(event.pointerId);
          }}
          onPointerMove={(event) => {
            if (!resizeOrigin.current) return;
            event.preventDefault();
            setResizeDelta(event.clientY - resizeOrigin.current.y);
          }}
          onPointerUp={(event) => {
            event.preventDefault();
            event.stopPropagation();
            finishResize(event);
          }}
          onPointerCancel={() => {
            resizeOrigin.current = null;
            setResizeDelta(null);
          }}
        >
          <span className="inline-flex h-3 w-10 items-center justify-center rounded-full bg-ds-surface-4 text-ds-text-3 shadow-ds-xs">
            <GripHorizontal className="h-3.5 w-3.5" />
          </span>
        </button>
      )}
    </div>
  );
}

type CompactProps = {
  item: AgendaCalendarItem;
  selected?: boolean;
  dense?: boolean;
  user?: AgendaTeamMember;
  showOwner?: boolean;
  /** Overrides puntuales (ej. chips slim de la banda all-day desktop). */
  className?: string;
  colorBySource?: Record<string, string>;
  onSelect: (item: AgendaCalendarItem) => void;
};

export function AgendaCompactEvent({
  item,
  selected = false,
  dense = false,
  user,
  showOwner = true,
  className,
  colorBySource,
  onSelect,
}: CompactProps) {
  const movable = isMovableAgendaItem(item);
  const { attributes, listeners, setNodeRef, transform, isDragging } = useDraggable({
    id: itemKey(item),
    disabled: !movable,
    data: { item },
  });
  const assigneeName = item.assignedName ?? user?.name ?? null;

  return (
    <button
      ref={setNodeRef}
      type="button"
      onClick={(event) => {
        event.stopPropagation();
        onSelect(item);
      }}
      style={{ transform: CSS.Translate.toString(transform) }}
      className={cn(
        "flex min-h-8 w-full min-w-0 max-w-full items-center gap-1.5 overflow-hidden rounded-md border px-1.5 text-left text-[12px] shadow-ds-xs focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary/50",
        eventTone(item, colorBySource),
        dense ? "h-11 sm:h-8" : "h-11 sm:h-9",
        movable && "cursor-grab active:cursor-grabbing touch-none",
        selected && "ring-2 ring-primary/35",
        isDragging && "opacity-25",
        className,
      )}
      title={assigneeName ? `${item.title} · ${assigneeName}` : item.title}
      {...listeners}
      {...attributes}
    >
      {!item.allDay && (
        <span className="shrink-0 font-mono opacity-75">
          {formatAgendaTime(new Date(item.start))}
        </span>
      )}
      <span className="min-w-0 flex-1 truncate font-medium">{item.title}</span>
      {!dense && showOwner && assigneeName && <Avatar name={assigneeName} size="sm" />}
    </button>
  );
}

type DragGuide = {
  dateKey: string;
  minute: number;
  allDay: boolean;
  title: string;
  duration: number;
} | null;

export function AgendaDragPreview({
  item,
  guide,
  colorBySource,
}: {
  item: AgendaCalendarItem;
  guide?: DragGuide;
  colorBySource?: Record<string, string>;
}) {
  const guideLabel = (() => {
    if (!guide) return null;
    if (guide.allDay) return "Todo el día";
    const end = guide.minute + guide.duration;
    const fmt = (m: number) =>
      `${String(Math.floor(m / 60) % 24).padStart(2, "0")}:${String(m % 60).padStart(2, "0")}`;
    return `${fmt(guide.minute)}–${fmt(end)}`;
  })();

  return (
    <div
      className={cn(
        "w-56 rounded-lg border px-2.5 py-2 text-left text-[13px] shadow-ds-lg",
        eventTone(item, colorBySource),
      )}
    >
      <p className="truncate font-semibold">{item.title}</p>
      <p className="mt-0.5 text-[12px] opacity-75">
        {guideLabel
          ? `${guideLabel} · ${item.title}`
          : item.allDay
            ? "Todo el día"
            : `${formatAgendaTime(new Date(item.start))}–${formatAgendaTime(new Date(item.end))}`}
      </p>
    </div>
  );
}

function eventTone(
  item: AgendaCalendarItem,
  colorBySource?: Record<string, string>,
): string {
  const color = colorBySource?.[itemSourceKey(item)] ?? "teal";
  return cn(
    paletteSoftBg(color),
    paletteFgText(color),
    "border-l-2",
    paletteBorder(color),
    "hover:opacity-90",
  );
}
