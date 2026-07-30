import { describe, expect, it } from "vitest";
import { milestoneRangeFromPlan } from "@/modules/agenda/deal-milestones";
import type { PlanMilestone } from "@/modules/crm/email/email-to-crm-structure.types";

function base(partial: Partial<PlanMilestone> = {}): PlanMilestone {
  return {
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

describe("milestoneRangeFromPlan", () => {
  it("construye rango horario con duración", () => {
    const range = milestoneRangeFromPlan(base());
    expect(range).not.toBeNull();
    expect(range!.allDay).toBe(false);
    expect(range!.endAt.getTime() - range!.startAt.getTime()).toBe(60 * 60_000);
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
