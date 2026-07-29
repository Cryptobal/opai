"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import {
  DndContext,
  DragOverlay,
  KeyboardSensor,
  MeasuringStrategy,
  PointerSensor,
  TouchSensor,
  pointerWithin,
  rectIntersection,
  useDroppable,
  useSensor,
  useSensors,
  type CollisionDetection,
  type DragEndEvent,
  type DragMoveEvent,
  type DragStartEvent,
} from "@dnd-kit/core";
import { Surface } from "@/components/opai-ds";
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";
import { CHILE_TZ, todayInChile, ymdInChile } from "@/lib/dates-cl";
import { cn } from "@/lib/utils";
import {
  AgendaCompactEvent,
  AgendaDragPreview,
  AgendaTimedEvent,
} from "./AgendaEventCard";
import {
  CALENDAR_DAY_MIN_WIDTH,
  CALENDAR_END_HOUR,
  CALENDAR_GUTTER_WIDTH,
  CALENDAR_START_HOUR,
  agendaItemDayKey,
  clamp,
  eventDurationMinutes,
  itemKey,
  layoutTimedItems,
  minuteFromOffset,
  minutesInChile,
  moveItemToSlot,
  resolveHourHeight,
} from "./agenda-calendar-utils";
import type { AgendaGridPrefs } from "./desktop/agenda-desktop-prefs";
import type {
  AgendaCalendarItem,
  AgendaSchedule,
  AgendaTeamMember,
  AgendaViewMode,
} from "./agenda-calendar.types";

type Props = {
  anchor: Date;
  days: Date[];
  items: AgendaCalendarItem[];
  view: AgendaViewMode;
  selectedKey: string | null;
  usersById: Map<string, AgendaTeamMember>;
  gridPrefs: AgendaGridPrefs;
  colorBySource?: Record<string, string>;
  onSelect: (item: AgendaCalendarItem) => void;
  onMove: (item: AgendaCalendarItem, schedule: AgendaSchedule) => void;
  onResize: (item: AgendaCalendarItem, schedule: AgendaSchedule) => void;
  onOpenDay?: (dateKey: string) => void;
  onSlotClick?: (
    dateKey: string,
    minute: number,
    origin: { x: number; y: number },
  ) => void;
};

const ALL_DAY_VISIBLE = 3;

type DropGuide = {
  dateKey: string;
  minute: number;
  allDay: boolean;
  title: string;
  duration: number;
};

/** Offset actual de Chile como etiqueta corta (GMT-4 / GMT-3 según DST). */
function gmtLabel(date: Date): string {
  const part = new Intl.DateTimeFormat("en-US", {
    timeZone: CHILE_TZ,
    timeZoneName: "shortOffset",
  })
    .formatToParts(date)
    .find((p) => p.type === "timeZoneName");
  return part?.value ?? "GMT-4";
}

const pointerThenRect: CollisionDetection = (args) => {
  const pointerHits = pointerWithin(args);
  return pointerHits.length > 0 ? pointerHits : rectIntersection(args);
};

function resolveDropTarget(
  pointerX: number,
  pointerY: number,
  root: HTMLElement | null,
  hourHeight: number,
  step: number,
  duration: number,
): { dateKey: string; minute: number; allDay: boolean } | null {
  if (!root) return null;

  const allDayEls = root.querySelectorAll<HTMLElement>("[data-agenda-allday]");
  for (const el of allDayEls) {
    const rect = el.getBoundingClientRect();
    if (
      pointerX >= rect.left &&
      pointerX <= rect.right &&
      pointerY >= rect.top &&
      pointerY <= rect.bottom
    ) {
      const dateKey = el.dataset.agendaAllday;
      if (dateKey) return { dateKey, minute: 9 * 60, allDay: true };
    }
  }

  const dayEls = root.querySelectorAll<HTMLElement>("[data-agenda-day]");
  for (const el of dayEls) {
    const rect = el.getBoundingClientRect();
    if (pointerX >= rect.left && pointerX <= rect.right) {
      const dateKey = el.dataset.agendaDay;
      if (!dateKey) continue;
      const offsetY = pointerY - rect.top;
      const minute = clamp(
        minuteFromOffset(offsetY, hourHeight, step),
        0,
        1440 - Math.max(step, duration),
      );
      return { dateKey, minute, allDay: false };
    }
  }

  // Month cells
  const monthEls = root.querySelectorAll<HTMLElement>("[data-agenda-month]");
  for (const el of monthEls) {
    const rect = el.getBoundingClientRect();
    if (
      pointerX >= rect.left &&
      pointerX <= rect.right &&
      pointerY >= rect.top &&
      pointerY <= rect.bottom
    ) {
      const dateKey = el.dataset.agendaMonth;
      if (dateKey) return { dateKey, minute: 9 * 60, allDay: false };
    }
  }

  return null;
}

export function AgendaCalendarGrid({
  anchor,
  days,
  items,
  view,
  selectedKey,
  usersById,
  gridPrefs,
  colorBySource,
  onSelect,
  onMove,
  onResize,
  onOpenDay,
  onSlotClick,
}: Props) {
  const anchorMonth = ymdInChile(anchor).slice(0, 7);
  const periodKey = `${view}:${ymdInChile(days[0] ?? anchor)}:${days.length}`;
  const [activeItem, setActiveItem] = useState<AgendaCalendarItem | null>(null);
  const [dropGuide, setDropGuide] = useState<DropGuide | null>(null);
  const [nowMinute, setNowMinute] = useState(() => minutesInChile(new Date()));
  const [availableHeight, setAvailableHeight] = useState(0);
  const scrollRef = useRef<HTMLDivElement>(null);
  const gridRootRef = useRef<HTMLDivElement>(null);
  const headerRef = useRef<HTMLDivElement>(null);

  const hourHeight = resolveHourHeight({
    fitToWindow: gridPrefs.fitToWindow,
    hourHeight: gridPrefs.hourHeight,
    startHour: gridPrefs.startHour,
    endHour: gridPrefs.endHour,
    availableHeight,
  });
  const gridHeight = (CALENDAR_END_HOUR - CALENDAR_START_HOUR) * hourHeight;
  const columns = `${CALENDAR_GUTTER_WIDTH}px repeat(${days.length}, minmax(0, 1fr))`;
  const minWidth = CALENDAR_GUTTER_WIDTH + days.length * CALENDAR_DAY_MIN_WIDTH;
  const step = gridPrefs.stepMinutes;

  // Medir alto disponible para fit-to-window (scroll − cabecera).
  useEffect(() => {
    if (view === "month") return;
    const scrollEl = scrollRef.current;
    if (!scrollEl) return;
    const measure = () => {
      const headerH = headerRef.current?.offsetHeight ?? 0;
      setAvailableHeight(Math.max(0, scrollEl.clientHeight - headerH));
    };
    measure();
    const ro = new ResizeObserver(measure);
    ro.observe(scrollEl);
    return () => ro.disconnect();
  }, [view, days.length]);

  // Auto-scroll al montar / cambiar vista·período·altura — no en cada refresh de datos.
  useEffect(() => {
    if (view === "month") return;
    const el = scrollRef.current;
    if (!el || typeof el.scrollTo !== "function") return;
    el.scrollTo({
      top: gridPrefs.startHour * hourHeight,
      behavior: "auto",
    });
  }, [view, periodKey, hourHeight, gridPrefs.startHour]);

  const sensors = useSensors(
    useSensor(PointerSensor, { activationConstraint: { distance: 8 } }),
    useSensor(TouchSensor, { activationConstraint: { delay: 220, tolerance: 8 } }),
    useSensor(KeyboardSensor),
  );

  useEffect(() => {
    const timer = window.setInterval(() => setNowMinute(minutesInChile(new Date())), 60_000);
    return () => window.clearInterval(timer);
  }, []);

  const itemsByDay = useMemo(() => {
    const map = new Map<string, AgendaCalendarItem[]>();
    for (const day of days) map.set(ymdInChile(day), []);
    for (const item of items) {
      const key = agendaItemDayKey(item);
      if (!map.has(key)) map.set(key, []);
      map.get(key)!.push(item);
    }
    for (const list of map.values()) {
      list.sort((a, b) => a.start.localeCompare(b.start));
    }
    return map;
  }, [days, items]);

  const pointerFromEvent = (event: DragEndEvent | DragMoveEvent) => {
    const activator = event.activatorEvent as PointerEvent | null;
    if (!activator || typeof activator.clientX !== "number") return null;
    return {
      x: activator.clientX + event.delta.x,
      y: activator.clientY + event.delta.y,
    };
  };

  const handleDragStart = (event: DragStartEvent) => {
    const item = event.active.data.current?.item as AgendaCalendarItem | undefined;
    setActiveItem(item ?? null);
    setDropGuide(null);
  };

  const handleDragMove = (event: DragMoveEvent) => {
    const item = event.active.data.current?.item as AgendaCalendarItem | undefined;
    const pointer = pointerFromEvent(event);
    if (!item || !pointer) {
      setDropGuide(null);
      return;
    }
    const duration = eventDurationMinutes(item);
    const target = resolveDropTarget(
      pointer.x,
      pointer.y,
      gridRootRef.current,
      hourHeight,
      step,
      duration,
    );
    if (!target) {
      setDropGuide(null);
      return;
    }
    setDropGuide({
      dateKey: target.dateKey,
      minute: target.minute,
      allDay: target.allDay && item.source === "tarea",
      title: item.title,
      duration,
    });
  };

  const handleDragEnd = (event: DragEndEvent) => {
    const item = event.active.data.current?.item as AgendaCalendarItem | undefined;
    const pointer = pointerFromEvent(event);
    setActiveItem(null);
    setDropGuide(null);
    if (!item || !pointer) return;

    const duration = eventDurationMinutes(item);
    const target = resolveDropTarget(
      pointer.x,
      pointer.y,
      gridRootRef.current,
      hourHeight,
      step,
      duration,
    );
    if (!target) return;

    // Month drop: conservar hora original / allDay.
    if (view === "month") {
      const schedule = moveItemToSlot(
        item,
        target.dateKey,
        item.allDay ? 9 * 60 : minutesInChile(new Date(item.start)),
        item.allDay,
        step,
      );
      const unchanged =
        schedule.start.toISOString() === item.start &&
        schedule.end.toISOString() === item.end &&
        schedule.allDay === item.allDay;
      if (!unchanged) onMove(item, schedule);
      return;
    }

    const schedule = moveItemToSlot(item, target.dateKey, target.minute, target.allDay, step);
    const unchanged =
      schedule.start.toISOString() === item.start &&
      schedule.end.toISOString() === item.end &&
      schedule.allDay === item.allDay;
    if (!unchanged) onMove(item, schedule);
  };

  const hourLabels = Array.from(
    { length: CALENDAR_END_HOUR - CALENDAR_START_HOUR },
    (_, index) => CALENDAR_START_HOUR + index,
  );

  const hourLinesBg = gridPrefs.halfHourLine
    ? `repeating-linear-gradient(
        to bottom,
        transparent 0,
        transparent calc(${hourHeight / 2}px - 1px),
        hsl(var(--ds-border-subtle) / 0.45) calc(${hourHeight / 2}px - 1px),
        hsl(var(--ds-border-subtle) / 0.45) ${hourHeight / 2}px,
        transparent ${hourHeight / 2}px,
        transparent calc(${hourHeight}px - 1px),
        hsl(var(--ds-border-subtle)) calc(${hourHeight}px - 1px),
        hsl(var(--ds-border-subtle)) ${hourHeight}px
      )`
    : `repeating-linear-gradient(
        to bottom,
        transparent 0,
        transparent calc(${hourHeight}px - 1px),
        hsl(var(--ds-border-subtle)) calc(${hourHeight}px - 1px),
        hsl(var(--ds-border-subtle)) ${hourHeight}px
      )`;

  if (view === "month") {
    const weekdayLabels =
      gridPrefs.firstDay === 0
        ? ["Dom", "Lun", "Mar", "Mié", "Jue", "Vie", "Sáb"]
        : ["Lun", "Mar", "Mié", "Jue", "Vie", "Sáb", "Dom"];
    return (
      <DndContext
        sensors={sensors}
        collisionDetection={pointerThenRect}
        measuring={{ droppable: { strategy: MeasuringStrategy.Always } }}
        onDragStart={handleDragStart}
        onDragMove={handleDragMove}
        onDragEnd={handleDragEnd}
      >
        <Surface
          elevation={1}
          padding="none"
          className="flex h-full max-h-full flex-col overflow-auto shadow-none"
        >
          <div ref={gridRootRef} className="flex min-h-0 flex-1 flex-col">
            <div className="grid shrink-0 grid-cols-7 border-b border-ds-border-subtle bg-ds-surface-2">
              {weekdayLabels.map((label) => (
                <div
                  key={label}
                  className="px-2 py-1.5 text-center text-[12px] font-medium uppercase tracking-wide text-ds-text-4"
                >
                  {label}
                </div>
              ))}
            </div>
            <div className="grid min-h-0 flex-1 auto-rows-fr grid-cols-7">
              {days.map((day) => {
                const key = ymdInChile(day);
                const dayItems = itemsByDay.get(key) ?? [];
                const muted = key.slice(0, 7) !== anchorMonth;
                return (
                  <MonthDayCell
                    key={key}
                    dateKey={key}
                    items={dayItems.slice(0, ALL_DAY_VISIBLE)}
                    overflow={Math.max(0, dayItems.length - ALL_DAY_VISIBLE)}
                    muted={muted}
                    selectedKey={selectedKey}
                    usersById={usersById}
                    showOwner={gridPrefs.showOwner}
                    colorBySource={colorBySource}
                    onSelect={onSelect}
                    onOpenDay={onOpenDay}
                  />
                );
              })}
            </div>
          </div>
        </Surface>
        <DragOverlay dropAnimation={null}>
          {activeItem ? (
            <AgendaDragPreview item={activeItem} guide={dropGuide} colorBySource={colorBySource} />
          ) : null}
        </DragOverlay>
      </DndContext>
    );
  }

  return (
    <DndContext
      sensors={sensors}
      collisionDetection={pointerThenRect}
      measuring={{ droppable: { strategy: MeasuringStrategy.Always } }}
      onDragStart={handleDragStart}
      onDragMove={handleDragMove}
      onDragEnd={handleDragEnd}
    >
      <Surface
        ref={scrollRef}
        elevation={1}
        padding="none"
        className="h-full max-h-full overflow-auto shadow-none"
        data-agenda-grid-scroll
      >
        <div
          ref={gridRootRef}
          data-agenda-grid-root
          style={{ minWidth }}
          className="relative"
        >
          <div
            ref={headerRef}
            className="sticky top-0 z-30 border-b border-ds-border-subtle bg-ds-surface-2"
            data-agenda-grid-header
          >
            <div className="grid" style={{ gridTemplateColumns: columns }} data-agenda-columns={days.length}>
              <div className="flex items-end justify-end border-r border-ds-border-subtle px-1.5 pb-1">
                <span className="font-mono text-[12px] leading-none text-ds-text-4">
                  {gmtLabel(anchor)}
                </span>
              </div>
              {days.map((day) => {
                const key = ymdInChile(day);
                const isToday = key === todayInChile();
                return (
                  <div
                    key={`head-${key}`}
                    className="flex min-w-0 items-center justify-center gap-1.5 overflow-hidden border-r border-ds-border-subtle px-2 py-1.5"
                  >
                    <span className="text-[12px] font-medium uppercase tracking-wide text-ds-text-4">
                      {day.toLocaleDateString("es-CL", {
                        weekday: "short",
                        timeZone: CHILE_TZ,
                      })}
                    </span>
                    <span
                      className={cn(
                        "inline-flex h-7 min-w-7 items-center justify-center rounded-full px-1 text-[13px] font-semibold",
                        isToday ? "bg-primary text-primary-foreground" : "text-ds-text-2",
                      )}
                    >
                      {day.toLocaleDateString("es-CL", {
                        day: "numeric",
                        timeZone: CHILE_TZ,
                      })}
                    </span>
                  </div>
                );
              })}
            </div>

            <div
              className="grid border-t border-ds-border-subtle"
              style={{ gridTemplateColumns: columns }}
              data-agenda-allday-band
            >
              <div className="border-r border-ds-border-subtle px-1.5 py-1.5 text-right text-[12px] leading-tight text-ds-text-4">
                Todo el día
              </div>
              {days.map((day) => {
                const key = ymdInChile(day);
                const allDayItems = (itemsByDay.get(key) ?? []).filter((item) => item.allDay);
                return (
                  <AllDayColumn
                    key={`allday-${key}`}
                    dateKey={key}
                    items={allDayItems}
                    selectedKey={selectedKey}
                    usersById={usersById}
                    showOwner={gridPrefs.showOwner}
                    colorBySource={colorBySource}
                    onSelect={onSelect}
                  />
                );
              })}
            </div>
          </div>

          <div
            className="grid"
            style={{ gridTemplateColumns: columns }}
            data-agenda-grid-body
          >
            <div
              className="relative border-r border-ds-border-subtle bg-ds-surface-1"
              style={{ height: gridHeight }}
            >
              {hourLabels.map((hour) => (
                <div
                  key={hour}
                  className="absolute right-0 w-full px-2 text-right font-mono text-[12px] leading-none text-ds-text-4"
                  style={{ top: hour * hourHeight + 2 }}
                >
                  {String(hour).padStart(2, "0")}:00
                </div>
              ))}
            </div>

            {days.map((day) => {
              const key = ymdInChile(day);
              const dayItems = (itemsByDay.get(key) ?? []).filter((item) => !item.allDay);
              const layout = layoutTimedItems(dayItems);
              const isToday = key === todayInChile();
              const showNow =
                gridPrefs.nowLine &&
                isToday &&
                nowMinute >= CALENDAR_START_HOUR * 60 &&
                nowMinute <= CALENDAR_END_HOUR * 60;

              return (
                <DayTimeColumn
                  key={key}
                  dateKey={key}
                  layout={layout}
                  selectedKey={selectedKey}
                  usersById={usersById}
                  showNow={showNow}
                  nowMinute={nowMinute}
                  hourHeight={hourHeight}
                  gridHeight={gridHeight}
                  hourLinesBg={hourLinesBg}
                  step={step}
                  showOwner={gridPrefs.showOwner}
                  colorBySource={colorBySource}
                  dropGuide={
                    dropGuide && !dropGuide.allDay && dropGuide.dateKey === key
                      ? dropGuide
                      : null
                  }
                  onSelect={onSelect}
                  onResize={onResize}
                  onSlotClick={onSlotClick}
                />
              );
            })}
          </div>
        </div>
      </Surface>

      <DragOverlay dropAnimation={null}>
        {activeItem ? (
          <AgendaDragPreview item={activeItem} guide={dropGuide} colorBySource={colorBySource} />
        ) : null}
      </DragOverlay>
    </DndContext>
  );
}

const ALL_DAY_CHIP = "h-[22px] min-h-0 min-w-0 sm:h-[22px] rounded";

function AllDayColumn({
  dateKey,
  items,
  selectedKey,
  usersById,
  showOwner,
  colorBySource,
  onSelect,
}: {
  dateKey: string;
  items: AgendaCalendarItem[];
  selectedKey: string | null;
  usersById: Map<string, AgendaTeamMember>;
  showOwner: boolean;
  colorBySource?: Record<string, string>;
  onSelect: (item: AgendaCalendarItem) => void;
}) {
  const { setNodeRef, isOver } = useDroppable({ id: `all-day:${dateKey}` });
  const visible = items.slice(0, ALL_DAY_VISIBLE);
  const overflow = items.slice(ALL_DAY_VISIBLE);

  return (
    <div
      ref={setNodeRef}
      data-agenda-allday={dateKey}
      className={cn(
        "max-h-[74px] min-h-[28px] min-w-0 space-y-0.5 overflow-hidden border-r border-ds-border-subtle px-1 py-1",
        isOver && "bg-primary/5",
      )}
    >
      {visible.map((item) => (
        <AgendaCompactEvent
          key={itemKey(item)}
          item={item}
          dense
          selected={selectedKey === itemKey(item)}
          user={usersById.get(item.assignedUserId)}
          showOwner={showOwner}
          className={ALL_DAY_CHIP}
          colorBySource={colorBySource}
          onSelect={onSelect}
        />
      ))}
      {overflow.length > 0 && (
        <Popover>
          <PopoverTrigger className="flex h-[18px] w-full min-w-0 items-center rounded px-1.5 text-left text-[12px] font-medium text-ds-text-3 hover:bg-ds-surface-3 ds-tap">
            +{overflow.length} más
          </PopoverTrigger>
          <PopoverContent
            align="start"
            className="w-64 min-w-0 max-w-none space-y-1 rounded-xl border-ds-border-default bg-ds-surface-1 p-1.5 shadow-ds-lg"
          >
            {overflow.map((item) => (
              <AgendaCompactEvent
                key={itemKey(item)}
                item={item}
                dense
                selected={selectedKey === itemKey(item)}
                user={usersById.get(item.assignedUserId)}
                showOwner={showOwner}
                colorBySource={colorBySource}
                onSelect={onSelect}
              />
            ))}
          </PopoverContent>
        </Popover>
      )}
    </div>
  );
}

function DayTimeColumn({
  dateKey,
  layout,
  selectedKey,
  usersById,
  showNow,
  nowMinute,
  hourHeight,
  gridHeight,
  hourLinesBg,
  step,
  showOwner,
  colorBySource,
  dropGuide,
  onSelect,
  onResize,
  onSlotClick,
}: {
  dateKey: string;
  layout: ReturnType<typeof layoutTimedItems>;
  selectedKey: string | null;
  usersById: Map<string, AgendaTeamMember>;
  showNow: boolean;
  nowMinute: number;
  hourHeight: number;
  gridHeight: number;
  hourLinesBg: string;
  step: number;
  showOwner: boolean;
  colorBySource?: Record<string, string>;
  dropGuide: DropGuide | null;
  onSelect: (item: AgendaCalendarItem) => void;
  onResize: (item: AgendaCalendarItem, schedule: AgendaSchedule) => void;
  onSlotClick?: (
    dateKey: string,
    minute: number,
    origin: { x: number; y: number },
  ) => void;
}) {
  const { setNodeRef, isOver } = useDroppable({ id: `timed:${dateKey}` });
  const isToday = dateKey === todayInChile();

  return (
    <div
      ref={setNodeRef}
      data-agenda-day={dateKey}
      className={cn(
        "relative min-w-0 overflow-hidden border-r border-ds-border-subtle bg-ds-surface-1",
        isOver && "bg-primary/5",
        isToday && "bg-primary/[0.03]",
      )}
      style={{ height: gridHeight }}
    >
      <div
        aria-hidden
        className="pointer-events-none absolute inset-0"
        style={{ backgroundImage: hourLinesBg }}
      />

      <div
        role="presentation"
        onClick={(event) => {
          const rect = event.currentTarget.getBoundingClientRect();
          const offsetY = event.clientY - rect.top;
          const minute = minuteFromOffset(offsetY, hourHeight, step);
          onSlotClick?.(dateKey, minute, { x: event.clientX, y: event.clientY });
        }}
        className="absolute inset-0 cursor-cell"
      />

      {showNow && (
        <div
          className="pointer-events-none absolute inset-x-0 z-10 border-t-2 border-status-danger"
          style={{ top: (nowMinute / 60) * hourHeight }}
        >
          <span className="absolute -left-1 -top-[5px] h-2 w-2 rounded-full bg-status-danger" />
          <span className="absolute left-1 -top-[9px] rounded bg-status-danger px-1 font-mono text-[12px] leading-4 text-white">
            {String(Math.floor(nowMinute / 60)).padStart(2, "0")}:
            {String(nowMinute % 60).padStart(2, "0")}
          </span>
        </div>
      )}

      {dropGuide && (
        <div
          className="pointer-events-none absolute inset-x-1 z-20 rounded-md border border-dashed border-primary/50 bg-primary/10 px-1.5 py-0.5"
          style={{
            top: (dropGuide.minute / 60) * hourHeight,
            height: Math.max(28, (dropGuide.duration / 60) * hourHeight),
          }}
        >
          <p className="truncate font-mono text-[12px] text-primary">
            {formatMinuteRange(dropGuide.minute, dropGuide.duration)} · {dropGuide.title}
          </p>
        </div>
      )}

      {layout.map(({ item, startMinute, endMinute, column, columnCount }) => {
        const top = (startMinute / 60) * hourHeight;
        const height = Math.max(44, ((endMinute - startMinute) / 60) * hourHeight);
        const width = 100 / columnCount;
        const left = column * width;
        return (
          <AgendaTimedEvent
            key={itemKey(item)}
            item={item}
            top={top}
            height={height}
            left={left}
            width={width}
            hourHeight={hourHeight}
            step={step}
            selected={selectedKey === itemKey(item)}
            user={usersById.get(item.assignedUserId)}
            showOwner={showOwner}
            colorBySource={colorBySource}
            onSelect={onSelect}
            onResize={onResize}
          />
        );
      })}
    </div>
  );
}

function formatMinuteRange(startMinute: number, duration: number): string {
  const end = startMinute + duration;
  const fmt = (m: number) =>
    `${String(Math.floor(m / 60) % 24).padStart(2, "0")}:${String(m % 60).padStart(2, "0")}`;
  return `${fmt(startMinute)}–${fmt(end)}`;
}

function MonthDayCell({
  dateKey,
  items,
  overflow,
  muted,
  selectedKey,
  usersById,
  showOwner,
  colorBySource,
  onSelect,
  onOpenDay,
}: {
  dateKey: string;
  items: AgendaCalendarItem[];
  overflow: number;
  muted: boolean;
  selectedKey: string | null;
  usersById: Map<string, AgendaTeamMember>;
  showOwner: boolean;
  colorBySource?: Record<string, string>;
  onSelect: (item: AgendaCalendarItem) => void;
  onOpenDay?: (dateKey: string) => void;
}) {
  const { setNodeRef, isOver } = useDroppable({ id: `month:${dateKey}` });
  const isToday = dateKey === todayInChile();

  return (
    <div
      ref={setNodeRef}
      data-agenda-month={dateKey}
      role={onOpenDay ? "button" : undefined}
      tabIndex={onOpenDay ? 0 : undefined}
      onClick={() => onOpenDay?.(dateKey)}
      onKeyDown={(event) => {
        if (onOpenDay && (event.key === "Enter" || event.key === " ")) {
          event.preventDefault();
          onOpenDay(dateKey);
        }
      }}
      className={cn(
        "flex min-h-0 min-w-0 flex-col gap-0.5 overflow-hidden border-b border-r border-ds-border-subtle p-1.5",
        muted && "bg-ds-surface-2/40",
        isOver && "bg-primary/5",
        isToday && "bg-primary/[0.04]",
        onOpenDay && "cursor-pointer transition-colors hover:bg-ds-surface-2/70",
      )}
    >
      <p
        className={cn(
          "inline-flex h-6 w-6 shrink-0 items-center justify-center rounded-full text-[12px] font-semibold",
          isToday ? "bg-primary text-primary-foreground" : "text-ds-text-3",
        )}
      >
        {Number(dateKey.slice(8, 10))}
      </p>
      {items.map((item) => (
        <AgendaCompactEvent
          key={itemKey(item)}
          item={item}
          dense
          selected={selectedKey === itemKey(item)}
          user={usersById.get(item.assignedUserId)}
          showOwner={showOwner}
          colorBySource={colorBySource}
          className="h-[22px] min-h-0 min-w-0 shrink-0 sm:h-[22px]"
          onSelect={onSelect}
        />
      ))}
      {overflow > 0 && (
        <p className="px-1 text-[12px] text-ds-text-4">+{overflow} más</p>
      )}
    </div>
  );
}
