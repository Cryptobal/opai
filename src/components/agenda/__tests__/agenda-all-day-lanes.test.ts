import { describe, expect, it } from "vitest";
import {
  allDaySpanContextLabel,
  buildAllDayLanes,
  groupAgendaItemsByDay,
} from "../agenda-calendar-utils";
import type { AgendaCalendarItem } from "../agenda-calendar.types";

function item(
  overrides: Partial<AgendaCalendarItem> & Pick<AgendaCalendarItem, "id" | "start">,
): AgendaCalendarItem {
  return {
    source: "licitacion",
    type: "licitacion",
    title: `Licitación · ${overrides.id}`,
    end: overrides.start,
    allDay: true,
    syncStatus: null,
    dealId: overrides.spanKey ?? overrides.id,
    assignedUserId: "u1",
    assignedName: null,
    accountName: null,
    installationName: null,
    address: null,
    status: "open",
    ...overrides,
  };
}

const WEEK = [
  "2026-07-20",
  "2026-07-21",
  "2026-07-22",
  "2026-07-23",
  "2026-07-24",
  "2026-07-25",
  "2026-07-26",
];

describe("buildAllDayLanes — agenda_visita", () => {
  it("evento OPAI multi-día (un solo item con span*) → barra continua", () => {
    const items = [
      item({
        id: "visita-1",
        source: "agenda_visita",
        type: "otra",
        title: "Capacitación",
        start: "2026-07-21T04:00:00.000Z",
        end: "2026-07-24T03:59:00.000Z",
        spanKey: "visita-1",
        spanStartYmd: "2026-07-21",
        spanEndYmd: "2026-07-23",
      }),
    ];
    const lanes = buildAllDayLanes(items, WEEK);
    expect(lanes).toHaveLength(1);
    const seg = lanes[0]!.segments[0]!;
    expect(seg.startIndex).toBe(1);
    expect(seg.endIndex).toBe(3);
    expect(seg.continuesBefore).toBe(false);
    expect(seg.continuesAfter).toBe(false);
  });
});

describe("groupAgendaItemsByDay", () => {
  it("repite all-day multi-día en cada día del rango", () => {
    const items = [
      item({
        id: "visita-2",
        source: "agenda_visita",
        type: "otra",
        title: "Banda",
        start: "2026-07-21T04:00:00.000Z",
        spanKey: "visita-2",
        spanStartYmd: "2026-07-21",
        spanEndYmd: "2026-07-23",
      }),
    ];
    const map = groupAgendaItemsByDay(items, WEEK);
    expect(map.get("2026-07-20")).toHaveLength(0);
    expect(map.get("2026-07-21")).toHaveLength(1);
    expect(map.get("2026-07-22")).toHaveLength(1);
    expect(map.get("2026-07-23")).toHaveLength(1);
    expect(map.get("2026-07-24")).toHaveLength(0);
  });
});

describe("buildAllDayLanes", () => {
  it("rango completo dentro de la ventana → un segmento sin chevrons", () => {
    const items = WEEK.slice(1, 4).map((day) =>
      item({
        id: `d1:${day}`,
        start: `${day}T12:00:00.000Z`,
        spanKey: "deal-1",
        spanStartYmd: "2026-07-21",
        spanEndYmd: "2026-07-23",
        title: "Licitación · Alpha · entrega 23-07",
      }),
    );
    const lanes = buildAllDayLanes(items, WEEK);
    expect(lanes).toHaveLength(1);
    expect(lanes[0]!.segments).toHaveLength(1);
    const seg = lanes[0]!.segments[0]!;
    expect(seg.startIndex).toBe(1);
    expect(seg.endIndex).toBe(3);
    expect(seg.continuesBefore).toBe(false);
    expect(seg.continuesAfter).toBe(false);
    expect(seg.isEntregaEnd).toBe(true);
  });

  it("rango que entra por la izquierda → continuesBefore", () => {
    const items = [
      item({
        id: "d2:2026-07-20",
        start: "2026-07-20T12:00:00.000Z",
        spanKey: "deal-2",
        spanStartYmd: "2026-07-18",
        spanEndYmd: "2026-07-22",
      }),
    ];
    const seg = buildAllDayLanes(items, WEEK)[0]!.segments[0]!;
    expect(seg.startIndex).toBe(0);
    expect(seg.endIndex).toBe(2);
    expect(seg.continuesBefore).toBe(true);
    expect(seg.continuesAfter).toBe(false);
  });

  it("rango que sale por la derecha → continuesAfter", () => {
    const items = [
      item({
        id: "d3:2026-07-24",
        start: "2026-07-24T12:00:00.000Z",
        spanKey: "deal-3",
        spanStartYmd: "2026-07-24",
        spanEndYmd: "2026-07-30",
      }),
    ];
    const seg = buildAllDayLanes(items, WEEK)[0]!.segments[0]!;
    expect(seg.startIndex).toBe(4);
    expect(seg.endIndex).toBe(6);
    expect(seg.continuesBefore).toBe(false);
    expect(seg.continuesAfter).toBe(true);
    expect(seg.isEntregaEnd).toBe(false);
  });

  it("rango que cruza ambos lados → ◀ y ▶", () => {
    const items = [
      item({
        id: "d4:2026-07-22",
        start: "2026-07-22T12:00:00.000Z",
        spanKey: "deal-4",
        spanStartYmd: "2026-07-10",
        spanEndYmd: "2026-08-01",
      }),
    ];
    const seg = buildAllDayLanes(items, WEEK)[0]!.segments[0]!;
    expect(seg.startIndex).toBe(0);
    expect(seg.endIndex).toBe(6);
    expect(seg.continuesBefore).toBe(true);
    expect(seg.continuesAfter).toBe(true);
  });

  it("dos rangos solapados → carriles distintos", () => {
    const items = [
      item({
        id: "a:2026-07-21",
        start: "2026-07-21T12:00:00.000Z",
        title: "Alpha",
        spanKey: "a",
        spanStartYmd: "2026-07-21",
        spanEndYmd: "2026-07-24",
      }),
      item({
        id: "b:2026-07-22",
        start: "2026-07-22T12:00:00.000Z",
        title: "Beta",
        spanKey: "b",
        spanStartYmd: "2026-07-22",
        spanEndYmd: "2026-07-25",
      }),
    ];
    const lanes = buildAllDayLanes(items, WEEK);
    expect(lanes).toHaveLength(2);
    expect(lanes[0]!.segments[0]!.item.spanKey).toBe("a");
    expect(lanes[1]!.segments[0]!.item.spanKey).toBe("b");
  });

  it("rango de un solo día → esquinas sin chevrons", () => {
    const items = [
      item({
        id: "solo",
        start: "2026-07-23T12:00:00.000Z",
        source: "tarea",
        type: "tarea",
        title: "Tarea all-day",
        allDay: true,
        dealId: null,
      }),
    ];
    const seg = buildAllDayLanes(items, WEEK)[0]!.segments[0]!;
    expect(seg.startIndex).toBe(3);
    expect(seg.endIndex).toBe(3);
    expect(seg.continuesBefore).toBe(false);
    expect(seg.continuesAfter).toBe(false);
  });
});

describe("allDaySpanContextLabel", () => {
  it("formatea posición y entrega (licitación)", () => {
    expect(
      allDaySpanContextLabel(
        {
          spanKey: "deal-1",
          spanStartYmd: "2026-08-10",
          spanEndYmd: "2026-08-21",
          start: "2026-08-12T12:00:00.000Z",
          allDay: true,
          source: "licitacion",
          type: "licitacion",
        },
        "2026-08-12",
      ),
    ).toBe("día 3 de 12 · entrega 21-08");
  });

  it("evento OPAI multi-día sin rótulo de entrega", () => {
    expect(
      allDaySpanContextLabel(
        {
          spanKey: "ev-1",
          spanStartYmd: "2026-08-10",
          spanEndYmd: "2026-08-15",
          start: "2026-08-10T04:00:00.000Z",
          allDay: true,
          source: "agenda_visita",
          type: "otra",
        },
        "2026-08-12",
      ),
    ).toBe("día 3 de 6");
  });
});
