import { render } from "@testing-library/react";
import { describe, expect, it, vi } from "vitest";
import { AgendaCalendarGrid } from "../AgendaCalendarGrid";
import { DEFAULT_AGENDA_PREFS, toGridPrefs } from "../desktop/agenda-desktop-prefs";
import type { AgendaCalendarItem } from "../agenda-calendar.types";

vi.mock("@dnd-kit/core", async () => {
  const actual = await vi.importActual<typeof import("@dnd-kit/core")>("@dnd-kit/core");
  return {
    ...actual,
    useDraggable: () => ({
      attributes: {},
      listeners: {},
      setNodeRef: () => {},
      transform: null,
      isDragging: false,
    }),
    useDroppable: () => ({ setNodeRef: () => {}, isOver: false }),
  };
});

const DAYS = Array.from({ length: 7 }, (_, i) => {
  const d = new Date(Date.UTC(2026, 6, 20 + i, 12, 0, 0));
  return d;
});

const LONG_ALL_DAY: AgendaCalendarItem = {
  id: "lic-1",
  source: "licitacion",
  type: "licitacion",
  title:
    "ENTREGA · RFQ / Zelestra – Vigilancia Planta FV Andino (24/7) con título muy largo",
  start: "2026-07-22T12:00:00.000Z",
  end: "2026-07-22T12:00:00.000Z",
  allDay: true,
  syncStatus: null,
  dealId: "deal-1",
  assignedUserId: "u1",
  assignedName: null,
  accountName: null,
  installationName: null,
  address: null,
  status: "open",
  spanKey: "deal-1",
  spanStartYmd: "2026-07-20",
  spanEndYmd: "2026-07-26",
};

function licDay(day: string, isEntrega = false): AgendaCalendarItem {
  return {
    id: isEntrega ? "deal-band" : `deal-band:${day}`,
    source: "licitacion",
    type: "licitacion",
    title: isEntrega
      ? "ENTREGA · Banda multi-día"
      : "Licitación · Banda multi-día · entrega 26-07",
    start: `${day}T12:00:00.000Z`,
    end: `${day}T12:00:00.000Z`,
    allDay: true,
    syncStatus: null,
    dealId: "deal-band",
    assignedUserId: "u1",
    assignedName: null,
    accountName: null,
    installationName: null,
    address: null,
    status: "open",
    spanKey: "deal-band",
    spanStartYmd: "2026-07-20",
    spanEndYmd: "2026-07-26",
  };
}

describe("AgendaCalendarGrid layout", () => {
  it("usa un único contenedor con minWidth y columnas minmax(0,1fr)", () => {
    const { container } = render(
      <AgendaCalendarGrid
        anchor={DAYS[0]}
        days={DAYS}
        items={[LONG_ALL_DAY]}
        view="week"
        selectedKey={null}
        usersById={new Map()}
        gridPrefs={toGridPrefs(DEFAULT_AGENDA_PREFS)}
        onSelect={() => {}}
        onMove={() => {}}
        onResize={() => {}}
      />,
    );

    const root = container.querySelector("[data-agenda-grid-root]") as HTMLElement;
    expect(root).toBeTruthy();
    expect(root.style.minWidth).toBe(`${56 + 7 * 120}px`);

    const header = container.querySelector("[data-agenda-grid-header] .grid") as HTMLElement;
    const body = container.querySelector("[data-agenda-grid-body]") as HTMLElement;
    expect(header).toBeTruthy();
    expect(body).toBeTruthy();
    expect(header.style.gridTemplateColumns).toContain("minmax(0, 1fr)");
    expect(body.style.gridTemplateColumns).toBe(header.style.gridTemplateColumns);

    // Cabecera y cuerpo: gutter + 7 días.
    expect(header.children).toHaveLength(8);
    expect(body.children).toHaveLength(8);

    // Sin min-w-max que ensancha por chips all-day.
    expect(root.className).not.toContain("min-w-max");
    expect(header.className).not.toContain("min-w-max");
    expect(body.className).not.toContain("min-w-max");
  });

  it("dibuja una banda multi-día como un solo segmento y conserva data-agenda-allday", () => {
    const items = [
      "2026-07-20",
      "2026-07-21",
      "2026-07-22",
      "2026-07-23",
      "2026-07-24",
      "2026-07-25",
      "2026-07-26",
    ].map((d, i, arr) => licDay(d, i === arr.length - 1));

    const { container } = render(
      <AgendaCalendarGrid
        anchor={DAYS[0]}
        days={DAYS}
        items={items}
        view="week"
        selectedKey={null}
        usersById={new Map()}
        gridPrefs={toGridPrefs(DEFAULT_AGENDA_PREFS)}
        onSelect={() => {}}
        onMove={() => {}}
        onResize={() => {}}
      />,
    );

    const band = container.querySelector("[data-agenda-allday-band]");
    expect(band).toBeTruthy();

    // Un segmento por deal, no un chip por día.
    const segmentButtons = band!.querySelectorAll("button[title]");
    expect(segmentButtons.length).toBe(1);
    expect(segmentButtons[0]!.textContent).toMatch(/Banda multi-día/);

    const dropCols = container.querySelectorAll("[data-agenda-allday]");
    expect(dropCols).toHaveLength(7);
    expect((dropCols[0] as HTMLElement).dataset.agendaAllday).toBe("2026-07-20");
  });

  it("en vista mes prioriza all-day antes que eventos con hora", () => {
    const timed: AgendaCalendarItem = {
      id: "timed-1",
      source: "agenda_visita",
      type: "cliente",
      title: "Visita puntual",
      start: "2026-07-22T15:00:00.000Z",
      end: "2026-07-22T16:00:00.000Z",
      allDay: false,
      syncStatus: null,
      dealId: null,
      assignedUserId: "u1",
      assignedName: null,
      accountName: null,
      installationName: null,
      address: null,
      status: "programada",
    };
    const allDay: AgendaCalendarItem = {
      ...LONG_ALL_DAY,
      id: "allday-month",
      title: "All day primero",
      start: "2026-07-22T12:00:00.000Z",
      spanKey: undefined,
      spanStartYmd: undefined,
      spanEndYmd: undefined,
    };

    const monthDays = Array.from({ length: 42 }, (_, i) => {
      const d = new Date(Date.UTC(2026, 5, 29 + i, 12, 0, 0));
      return d;
    });

    const { container } = render(
      <AgendaCalendarGrid
        anchor={new Date(Date.UTC(2026, 6, 1, 12, 0, 0))}
        days={monthDays}
        items={[timed, allDay]}
        view="month"
        selectedKey={null}
        usersById={new Map()}
        gridPrefs={toGridPrefs(DEFAULT_AGENDA_PREFS)}
        onSelect={() => {}}
        onMove={() => {}}
        onResize={() => {}}
      />,
    );

    const cell = container.querySelector('[data-agenda-month="2026-07-22"]');
    expect(cell).toBeTruthy();
    const labels = Array.from(cell!.querySelectorAll("button")).map((b) =>
      (b.textContent ?? "").trim(),
    );
    const allDayIdx = labels.findIndex((t) => t.includes("All day primero"));
    const timedIdx = labels.findIndex((t) => t.includes("Visita puntual"));
    expect(allDayIdx).toBeGreaterThanOrEqual(0);
    expect(timedIdx).toBeGreaterThanOrEqual(0);
    expect(allDayIdx).toBeLessThan(timedIdx);
  });
});
