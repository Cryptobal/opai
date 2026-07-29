import { describe, expect, it } from "vitest";
import {
  isHubTaskForUser,
  hubAgendaItemHref,
  hubAgendaDayHref,
  hubTareaHref,
  type HubAgendaItem,
} from "../agenda-hub-item";

function item(overrides: Partial<HubAgendaItem> & { id: string }): HubAgendaItem {
  return {
    type: "tarea",
    title: "Tarea",
    start: "2026-07-28T13:00:00.000Z",
    allDay: true,
    syncStatus: null,
    source: "tarea",
    ...overrides,
  };
}

describe("isHubTaskForUser", () => {
  it("deja pasar items que no son tareas", () => {
    expect(
      isHubTaskForUser(item({ id: "v1", source: "google", type: "event" }), "u1"),
    ).toBe(true);
  });

  it("incluye al responsable en assignedUserIds", () => {
    expect(
      isHubTaskForUser(
        item({ id: "t1", assignedUserIds: ["u2", "u1"] }),
        "u1",
      ),
    ).toBe(true);
  });

  it("excluye tareas de otro responsable", () => {
    expect(
      isHubTaskForUser(item({ id: "t1", assignedUserIds: ["u2"], assignedUserId: "u2" }), "u1"),
    ).toBe(false);
  });

  it("sin assignees (legacy) queda visible", () => {
    expect(isHubTaskForUser(item({ id: "t1" }), "u1")).toBe(true);
  });
});

describe("hubAgendaItemHref", () => {
  it("abre visita nativa con ?visita=", () => {
    expect(
      hubAgendaItemHref(item({ id: "v1", source: "agenda_visita", type: "cliente", allDay: false })),
    ).toBe("/opai/agenda?visita=v1");
  });

  it("abre licitación con ?licitacion=", () => {
    expect(
      hubAgendaItemHref(
        item({ id: "range-1", source: "licitacion", type: "licitacion", dealId: "deal-9" }),
      ),
    ).toBe("/opai/agenda?licitacion=deal-9");
  });

  it("tareas abren fecha + modal; google usa ?item=", () => {
    expect(hubAgendaItemHref(item({ id: "t1", source: "tarea", start: "2026-07-29" }))).toBe(
      "/opai/agenda?date=2026-07-29&tarea=t1",
    );
    expect(
      hubAgendaItemHref(
        item({ id: "g1", source: "google", type: "event", start: "2026-07-29T15:00:00.000Z", allDay: false }),
      ),
    ).toMatch(/^\/opai\/agenda\?date=2026-07-29&item=google%3Ag1$/);
    expect(hubAgendaDayHref("2026-07-30")).toBe("/opai/agenda?date=2026-07-30");
  });

  it("detalle de tarea en /opai/tareas", () => {
    expect(hubTareaHref("abc")).toBe("/opai/tareas?task=abc");
  });
});
