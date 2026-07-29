import { describe, expect, it } from "vitest";
import { isHubTaskForUser, type HubAgendaItem } from "../agenda-hub-item";

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
