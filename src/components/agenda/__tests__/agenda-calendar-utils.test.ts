import { describe, expect, it } from "vitest";
import { ymdInChile } from "@/lib/dates-cl";
import {
  CALENDAR_HOUR_HEIGHT,
  dateAtChileSlot,
  displayCalendarDays,
  eventDurationMinutes,
  layoutTimedItems,
  minuteFromOffset,
  moveItemToSlot,
  resizedSchedule,
  snapTo,
  startOfWeekChile,
  visibleCalendarRange,
} from "../agenda-calendar-utils";
import type { AgendaCalendarItem } from "../agenda-calendar.types";

function item(
  id: string,
  start: string,
  end: string,
  overrides: Partial<AgendaCalendarItem> = {},
): AgendaCalendarItem {
  return {
    id,
    source: "agenda_visita",
    type: "cliente",
    title: `Evento ${id}`,
    start,
    end,
    allDay: false,
    syncStatus: null,
    dealId: null,
    assignedUserId: "user-1",
    assignedName: "Camila Rojas",
    accountName: null,
    installationName: null,
    address: null,
    status: "programada",
    ...overrides,
  };
}

describe("agenda calendar utils", () => {
  it("genera una vista configurable de tres días", () => {
    const anchor = new Date("2026-07-22T15:00:00.000Z");
    const range = visibleCalendarRange(anchor, "multi", 3);

    expect(range.days).toHaveLength(3);
    expect(range.days.map(ymdInChile)).toEqual([
      "2026-07-22",
      "2026-07-23",
      "2026-07-24",
    ]);
    expect(ymdInChile(range.to)).toBe("2026-07-25");
  });

  it("construye horas en Chile respetando la zona horaria", () => {
    const slot = dateAtChileSlot("2026-07-23", 14 * 60 + 30);

    expect(slot.toISOString()).toBe("2026-07-23T18:30:00.000Z");
  });

  it("mueve una tarea a otro día y hora conservando su duración", () => {
    const task = item(
      "task-1",
      "2026-07-22T13:00:00.000Z",
      "2026-07-22T13:30:00.000Z",
      { source: "tarea", type: "tarea" },
    );

    const moved = moveItemToSlot(task, "2026-07-24", 14 * 60 + 30);

    expect(moved.start.toISOString()).toBe("2026-07-24T18:30:00.000Z");
    expect(moved.end.getTime() - moved.start.getTime()).toBe(30 * 60_000);
    expect(moved.allDay).toBe(false);
  });

  it("ajusta la duración en intervalos de 15 minutos y respeta mínimo de 30", () => {
    const visit = item(
      "visit-1",
      "2026-07-22T13:00:00.000Z",
      "2026-07-22T14:00:00.000Z",
    );

    const longer = resizedSchedule(visit, CALENDAR_HOUR_HEIGHT / 2);
    const shorter = resizedSchedule(visit, -CALENDAR_HOUR_HEIGHT * 2);

    expect(eventDurationMinutes({ ...visit, end: longer.end.toISOString() })).toBe(90);
    expect(eventDurationMinutes({ ...visit, end: shorter.end.toISOString() })).toBe(30);
  });

  it("distribuye eventos solapados en columnas y recupera el ancho después", () => {
    const entries = layoutTimedItems([
      item("a", "2026-07-22T13:00:00.000Z", "2026-07-22T14:00:00.000Z"),
      item("b", "2026-07-22T13:30:00.000Z", "2026-07-22T14:30:00.000Z"),
      item("c", "2026-07-22T15:00:00.000Z", "2026-07-22T16:00:00.000Z"),
    ]);

    expect(entries.find((entry) => entry.item.id === "a")?.columnCount).toBe(2);
    expect(entries.find((entry) => entry.item.id === "b")?.column).toBe(1);
    expect(entries.find((entry) => entry.item.id === "c")?.columnCount).toBe(1);
  });

  it("startOfWeekChile respeta firstDay 0|1", () => {
    // Miércoles 22 jul 2026 Chile
    const anchor = new Date("2026-07-22T15:00:00.000Z");
    expect(ymdInChile(startOfWeekChile(anchor, 1))).toBe("2026-07-20"); // lunes
    expect(ymdInChile(startOfWeekChile(anchor, 0))).toBe("2026-07-19"); // domingo
  });

  it("semana sin fines de semana renderiza 5 días; el rango API sigue en 7", () => {
    const anchor = new Date("2026-07-22T15:00:00.000Z");
    const range = visibleCalendarRange(anchor, "week", 3, {
      firstDay: 1,
      showWeekends: false,
    });
    expect(range.days).toHaveLength(7);
    expect(displayCalendarDays(range.days, "week", false)).toHaveLength(5);
  });

  it("snapTo respeta pasos 5/15/30", () => {
    expect(snapTo(17, 5)).toBe(15);
    expect(snapTo(22, 15)).toBe(15);
    expect(snapTo(44, 30)).toBe(30);
  });

  it("minuteFromOffset calcula minuto desde offset vertical", () => {
    expect(minuteFromOffset(84, 84, 15)).toBe(60);
    expect(minuteFromOffset(42, 84, 15)).toBe(30);
  });

  it("moveItemToSlot no marca all-day en visitas", () => {
    const visit = item(
      "v1",
      "2026-07-22T13:00:00.000Z",
      "2026-07-22T14:00:00.000Z",
    );
    const moved = moveItemToSlot(visit, "2026-07-23", 10 * 60, true);
    expect(moved.allDay).toBe(false);
    expect(eventDurationMinutes({ ...visit, start: moved.start.toISOString(), end: moved.end.toISOString() })).toBe(60);
  });
});
