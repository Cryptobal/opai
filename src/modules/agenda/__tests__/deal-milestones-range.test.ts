import { describe, expect, it } from "vitest";
import {
  milestoneRangeFromPlan,
  resolveMilestoneTime,
} from "@/modules/agenda/deal-milestones";
import type { PlanMilestone } from "@/modules/crm/email/email-to-crm-structure.types";
import { milestonesFromLicitacion } from "@/modules/crm/email/email-to-crm-structure.types";

function base(partial: Partial<PlanMilestone> = {}): PlanMilestone {
  return {
    id: "test-milestone-id",
    kind: "consultas",
    date: "2026-08-17",
    time: "09:00",
    durationMin: 60,
    allDay: false,
    participantIds: [],
    externalEmails: [],
    enabled: true,
    ...partial,
  };
}

describe("resolveMilestoneTime", () => {
  it.each([
    ["", null],
    [null as unknown as string, null],
    ["00:00", null],
    ["09:30", "09:30"],
    ["23:45", "23:45"],
  ] as const)("time %j → %j", (time, expected) => {
    expect(resolveMilestoneTime({ time: time as string, allDay: false })).toBe(
      expected,
    );
  });

  it("allDay ignora la hora", () => {
    expect(resolveMilestoneTime({ time: "00:00", allDay: true })).toBeNull();
  });
});

describe("milestoneRangeFromPlan", () => {
  it("construye rango horario con duración", () => {
    const range = milestoneRangeFromPlan(base());
    expect(range).not.toBeNull();
    expect(range!.allDay).toBe(false);
    expect(range!.endAt.getTime() - range!.startAt.getTime()).toBe(60 * 60_000);
  });

  it("00:00 cae a 09:00 por defecto", () => {
    const withMidnight = milestoneRangeFromPlan(base({ time: "00:00" }));
    const withNine = milestoneRangeFromPlan(base({ time: "09:00" }));
    expect(withMidnight!.startAt.getTime()).toBe(withNine!.startAt.getTime());
  });

  it("todo el día cubre 00:00–23:59 Chile", () => {
    const range = milestoneRangeFromPlan(base({ allDay: true, time: "15:30" }));
    expect(range).not.toBeNull();
    expect(range!.allDay).toBe(true);
    const spanMin = (range!.endAt.getTime() - range!.startAt.getTime()) / 60_000;
    expect(spanMin).toBe(24 * 60 - 1);
  });

  it("rechaza fecha inválida", () => {
    expect(milestoneRangeFromPlan(base({ date: "17/08/2026" }))).toBeNull();
  });
});

describe("milestonesFromLicitacion", () => {
  it("nunca siembra 00:00 / 12:00 a.m.", () => {
    const rows = milestonesFromLicitacion({
      fechaConsultas: "2026-08-17",
      horaConsultas: "00:00",
      fechaVisitaTecnica: "2026-08-20",
      horaVisitaTecnica: null,
      fechaEntrega: "2026-09-03",
      horaEntrega: "09:30",
    });
    expect(rows.find((r) => r.kind === "consultas")?.time).toBe("09:00");
    expect(rows.find((r) => r.kind === "visita_tecnica")?.time).toBe("09:00");
    expect(rows.find((r) => r.kind === "entrega")?.time).toBe("09:30");
    expect(rows.every((r) => r.time !== "00:00")).toBe(true);
  });
});
