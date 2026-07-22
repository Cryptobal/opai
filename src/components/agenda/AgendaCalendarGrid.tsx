"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import {
  DndContext,
  DragOverlay,
  KeyboardSensor,
  PointerSensor,
  TouchSensor,
  closestCenter,
  useDroppable,
  useSensor,
  useSensors,
  type DragEndEvent,
  type DragStartEvent,
} from "@dnd-kit/core";
import { Surface } from "@/components/opai-ds";
import { todayInChile, ymdInChile } from "@/lib/dates-cl";
import { cn } from "@/lib/utils";
import {
  AgendaCompactEvent,
  AgendaDragPreview,
  AgendaTimedEvent,
} from "./AgendaEventCard";
import {
  CALENDAR_END_HOUR,
  CALENDAR_HOUR_HEIGHT,
  CALENDAR_SLOT_MINUTES,
  CALENDAR_AUTOSCROLL_HOUR,
  CALENDAR_START_HOUR,
  agendaItemDayKey,
  calendarSlotMinutes,
  itemKey,
  layoutTimedItems,
  minutesInChile,
  moveItemToSlot,
  snapMinutes,
} from "./agenda-calendar-utils";
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
  onSelect: (item: AgendaCalendarItem) => void;
  onMove: (item: AgendaCalendarItem, schedule: AgendaSchedule) => void;
  onResize: (item: AgendaCalendarItem, schedule: AgendaSchedule) => void;
};

const GRID_HEIGHT =
  (CALENDAR_END_HOUR - CALENDAR_START_HOUR) * CALENDAR_HOUR_HEIGHT;

export function AgendaCalendarGrid({
  anchor,
  days,
  items,
  view,
  selectedKey,
  usersById,
  onSelect,
  onMove,
  onResize,
}: Props) {
  const anchorMonth = ymdInChile(anchor).slice(0, 7);
  const [activeItem, setActiveItem] = useState<AgendaCalendarItem | null>(null);
  const [nowMinute, setNowMinute] = useState(() => minutesInChile(new Date()));
  const scrollRef = useRef<HTMLDivElement>(null);

  // Con rango 0-24, arrancar mirando las 07:00 (fix B8 del audit).
  useEffect(() => {
    if (view === "month") return;
    scrollRef.current?.scrollTo({
      top: (CALENDAR_AUTOSCROLL_HOUR - CALENDAR_START_HOUR) * CALENDAR_HOUR_HEIGHT,
      behavior: "auto",
    });
  }, [view, anchorMonth]);

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

  const handleDragStart = (event: DragStartEvent) => {
    const item = event.active.data.current?.item as AgendaCalendarItem | undefined;
    setActiveItem(item ?? null);
  };

  const handleDragEnd = (event: DragEndEvent) => {
    setActiveItem(null);
    const item = event.active.data.current?.item as AgendaCalendarItem | undefined;
    if (!item || !event.over) return;

    const overId = String(event.over.id);
    const dateKey = overId.includes(":") ? overId.split(":").pop()! : overId;
    if (!/^\d{4}-\d{2}-\d{2}$/.test(dateKey)) return;
    const targetAllDay = overId.startsWith("all-day:");
    const targetTimed = overId.startsWith("timed:");
    const deltaMinutes = snapMinutes((event.delta.y / CALENDAR_HOUR_HEIGHT) * 60);
    const originalMinute = item.allDay ? 9 * 60 : minutesInChile(new Date(item.start));
    const nextMinute = clamp(
      originalMinute + deltaMinutes,
      CALENDAR_START_HOUR * 60,
      CALENDAR_END_HOUR * 60 - 15,
    );
    const schedule = moveItemToSlot(
      item,
      dateKey,
      nextMinute,
      targetAllDay ? true : targetTimed ? false : item.allDay,
    );
    const unchanged =
      schedule.start.toISOString() === item.start &&
      schedule.end.toISOString() === item.end &&
      schedule.allDay === item.allDay;
    if (!unchanged) onMove(item, schedule);
  };

  if (view === "month") {
    return (
      <DndContext
        sensors={sensors}
        collisionDetection={closestCenter}
        onDragStart={handleDragStart}
        onDragEnd={handleDragEnd}
      >
        <Surface elevation={1} padding="none" className="overflow-x-auto shadow-none">
          <div className="grid min-w-[760px] grid-cols-7 border-b border-ds-border-subtle bg-ds-surface-2">
            {["Lun", "Mar", "Mié", "Jue", "Vie", "Sáb", "Dom"].map((label) => (
              <div
                key={label}
                className="px-2 py-2 text-center text-[12px] font-medium uppercase tracking-wide text-ds-text-4"
              >
                {label}
              </div>
            ))}
          </div>
          <div className="grid min-w-[760px] grid-cols-7">
            {days.map((day) => {
              const key = ymdInChile(day);
              const dayItems = itemsByDay.get(key) ?? [];
              const muted = key.slice(0, 7) !== anchorMonth;
              return (
                <MonthDayCell
                  key={key}
                  dateKey={key}
                  day={day}
                  items={dayItems.slice(0, 4)}
                  overflow={Math.max(0, dayItems.length - 4)}
                  muted={muted}
                  selectedKey={selectedKey}
                  usersById={usersById}
                  onSelect={onSelect}
                />
              );
            })}
          </div>
        </Surface>
        <DragOverlay dropAnimation={null}>
          {activeItem ? <AgendaDragPreview item={activeItem} /> : null}
        </DragOverlay>
      </DndContext>
    );
  }

  const hourLabels = Array.from(
    { length: CALENDAR_END_HOUR - CALENDAR_START_HOUR },
    (_, index) => CALENDAR_START_HOUR + index,
  );

  return (
    <DndContext
      sensors={sensors}
      collisionDetection={closestCenter}
      onDragStart={handleDragStart}
      onDragEnd={handleDragEnd}
    >
      <Surface
        ref={scrollRef}
        elevation={1}
        padding="none"
        className="max-h-[70vh] overflow-auto shadow-none"
      >
        <div>
          <div
            className="sticky top-0 z-30 grid min-w-max border-b border-ds-border-subtle bg-ds-surface-2"
            style={{ gridTemplateColumns: `56px repeat(${days.length}, minmax(140px, 1fr))` }}
          >
            <div className="border-r border-ds-border-subtle" />
            {days.map((day) => {
              const key = ymdInChile(day);
              const isToday = key === todayInChile();
              return (
                <div
                  key={`head-${key}`}
                  className="border-r border-ds-border-subtle px-2 py-2 text-center"
                >
                  <p className="text-[12px] uppercase tracking-wide text-ds-text-4">
                    {day.toLocaleDateString("es-CL", {
                      weekday: "short",
                      timeZone: "America/Santiago",
                    })}
                  </p>
                  <p
                    className={cn(
                      "mt-0.5 inline-flex h-8 min-w-8 items-center justify-center rounded-full text-[13px] font-semibold",
                      isToday ? "bg-primary text-primary-foreground" : "text-ds-text-2",
                    )}
                  >
                    {day.toLocaleDateString("es-CL", {
                      day: "numeric",
                      timeZone: "America/Santiago",
                    })}
                  </p>
                </div>
              );
            })}
          </div>

          <div
            className="grid min-w-max border-b border-ds-border-subtle"
            style={{ gridTemplateColumns: `56px repeat(${days.length}, minmax(140px, 1fr))` }}
          >
            <div className="border-r border-ds-border-subtle px-2 py-3 text-[12px] text-ds-text-4">
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
                  onSelect={onSelect}
                />
              );
            })}
          </div>

          <div
            className="grid min-w-max"
            style={{ gridTemplateColumns: `56px repeat(${days.length}, minmax(140px, 1fr))` }}
          >
            <div className="relative border-r border-ds-border-subtle bg-ds-surface-1">
              {hourLabels.map((hour) => (
                <div
                  key={hour}
                  className="border-b border-ds-border-subtle px-2 text-right text-[12px] text-ds-text-4"
                  style={{ height: CALENDAR_HOUR_HEIGHT }}
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
                  onSelect={onSelect}
                  onResize={onResize}
                />
              );
            })}
          </div>
        </div>
      </Surface>

      <DragOverlay dropAnimation={null}>
        {activeItem ? <AgendaDragPreview item={activeItem} /> : null}
      </DragOverlay>
    </DndContext>
  );
}

function AllDayColumn({
  dateKey,
  items,
  selectedKey,
  usersById,
  onSelect,
}: {
  dateKey: string;
  items: AgendaCalendarItem[];
  selectedKey: string | null;
  usersById: Map<string, AgendaTeamMember>;
  onSelect: (item: AgendaCalendarItem) => void;
}) {
  const { setNodeRef, isOver } = useDroppable({ id: `all-day:${dateKey}` });

  return (
    <div
      ref={setNodeRef}
      className={cn(
        "min-h-[52px] space-y-1 border-r border-ds-border-subtle px-1.5 py-2",
        isOver && "bg-primary/5",
      )}
    >
      {items.map((item) => (
        <AgendaCompactEvent
          key={itemKey(item)}
          item={item}
          dense
          selected={selectedKey === itemKey(item)}
          user={usersById.get(item.assignedUserId)}
          onSelect={onSelect}
        />
      ))}
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
  onSelect,
  onResize,
}: {
  dateKey: string;
  layout: ReturnType<typeof layoutTimedItems>;
  selectedKey: string | null;
  usersById: Map<string, AgendaTeamMember>;
  showNow: boolean;
  nowMinute: number;
  onSelect: (item: AgendaCalendarItem) => void;
  onResize: (item: AgendaCalendarItem, schedule: AgendaSchedule) => void;
}) {
  const { setNodeRef, isOver } = useDroppable({ id: `timed:${dateKey}` });
  const isToday = dateKey === todayInChile();
  const slots = calendarSlotMinutes();

  return (
    <div
      ref={setNodeRef}
      className={cn(
        "relative border-r border-ds-border-subtle bg-ds-surface-1",
        isOver && "bg-primary/5",
        isToday && "bg-primary/[0.03]",
      )}
      style={{ height: GRID_HEIGHT }}
    >
      <div className="relative" style={{ height: GRID_HEIGHT }}>
        {slots.map((minute) => (
          <div
            key={minute}
            className="absolute inset-x-0 border-b border-ds-border-subtle/70"
            style={{
              top: ((minute - CALENDAR_START_HOUR * 60) / 60) * CALENDAR_HOUR_HEIGHT,
              height: (CALENDAR_SLOT_MINUTES / 60) * CALENDAR_HOUR_HEIGHT,
            }}
          />
        ))}

        {showNow && (
          <div
            className="pointer-events-none absolute inset-x-0 z-10 border-t-2 border-primary"
            style={{
              top: ((nowMinute - CALENDAR_START_HOUR * 60) / 60) * CALENDAR_HOUR_HEIGHT,
            }}
          >
            <span className="absolute -left-1 -top-1.5 h-3 w-3 rounded-full bg-primary" />
          </div>
        )}

        {layout.map(({ item, startMinute, endMinute, column, columnCount }) => {
          const top = ((startMinute - CALENDAR_START_HOUR * 60) / 60) * CALENDAR_HOUR_HEIGHT;
          const height = Math.max(
            44,
            ((endMinute - startMinute) / 60) * CALENDAR_HOUR_HEIGHT,
          );
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
              selected={selectedKey === itemKey(item)}
              user={usersById.get(item.assignedUserId)}
              onSelect={onSelect}
              onResize={onResize}
            />
          );
        })}
      </div>
    </div>
  );
}

function MonthDayCell({
  dateKey,
  day,
  items,
  overflow,
  muted,
  selectedKey,
  usersById,
  onSelect,
}: {
  dateKey: string;
  day: Date;
  items: AgendaCalendarItem[];
  overflow: number;
  muted: boolean;
  selectedKey: string | null;
  usersById: Map<string, AgendaTeamMember>;
  onSelect: (item: AgendaCalendarItem) => void;
}) {
  const { setNodeRef, isOver } = useDroppable({ id: `month:${dateKey}` });
  const isToday = dateKey === todayInChile();

  return (
    <div
      ref={setNodeRef}
      className={cn(
        "min-h-[120px] space-y-1 border-b border-r border-ds-border-subtle p-1.5",
        muted && "bg-ds-surface-2/40",
        isOver && "bg-primary/5",
        isToday && "bg-primary/[0.04]",
      )}
    >
      <p
        className={cn(
          "mb-1 inline-flex h-7 min-w-7 items-center justify-center rounded-full px-1 text-[12px] font-semibold",
          isToday ? "bg-primary text-primary-foreground" : "text-ds-text-3",
        )}
      >
        {day.toLocaleDateString("es-CL", { day: "numeric", timeZone: "America/Santiago" })}
      </p>
      {items.map((item) => (
        <AgendaCompactEvent
          key={itemKey(item)}
          item={item}
          dense
          selected={selectedKey === itemKey(item)}
          user={usersById.get(item.assignedUserId)}
          onSelect={onSelect}
        />
      ))}
      {overflow > 0 && (
        <p className="px-1 text-[12px] text-ds-text-4">+{overflow} más</p>
      )}
    </div>
  );
}

function clamp(value: number, min: number, max: number): number {
  return Math.min(max, Math.max(min, value));
}
