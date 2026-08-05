import { describe, expect, it } from "vitest";
import { isInspectorScheduleDirty } from "../AgendaInspector";

const baseItem = {
  start: "2026-08-10T13:00:00.000Z", // 09:00 Chile (UTC-4 en agosto)
  allDay: false,
  assignedUserId: "u1",
};

describe("isInspectorScheduleDirty", () => {
  it("false cuando el draft iguala el item cargado", () => {
    expect(
      isInspectorScheduleDirty(baseItem, {
        date: "2026-08-10",
        time: "09:00",
        assignedUserId: "u1",
      }),
    ).toBe(false);
  });

  it("true si cambia la hora", () => {
    expect(
      isInspectorScheduleDirty(baseItem, {
        date: "2026-08-10",
        time: "10:30",
        assignedUserId: "u1",
      }),
    ).toBe(true);
  });

  it("true si cambia el responsable", () => {
    expect(
      isInspectorScheduleDirty(baseItem, {
        date: "2026-08-10",
        time: "09:00",
        assignedUserId: "u2",
      }),
    ).toBe(true);
  });

  it("all-day ignora time vacío vs baseline vacío", () => {
    expect(
      isInspectorScheduleDirty(
        { ...baseItem, allDay: true },
        { date: "2026-08-10", time: "", assignedUserId: "u1" },
      ),
    ).toBe(false);
  });
});
