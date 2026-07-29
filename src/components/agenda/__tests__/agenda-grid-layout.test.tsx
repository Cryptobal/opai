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
  start: "2026-07-22",
  end: "2026-07-22",
  allDay: true,
  syncStatus: null,
  dealId: "deal-1",
  assignedUserId: "u1",
  assignedName: null,
  accountName: null,
  installationName: null,
  address: null,
  status: "open",
};

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
});
