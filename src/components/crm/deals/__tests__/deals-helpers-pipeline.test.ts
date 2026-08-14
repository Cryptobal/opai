import { describe, expect, it } from "vitest";
import {
  dealCloseDateYmd,
  formatDealCloseDate,
  formatDealDateCountdown,
  getDealCloseDateTone,
  isOpenDeal,
  truncateNextStep,
} from "@/components/crm/deals/deals-helpers";
import type { CrmDeal } from "@/types";

function baseDeal(overrides: Partial<CrmDeal> = {}): CrmDeal {
  return {
    id: "d1",
    stageId: "s1",
    title: "Test",
    amount: "0",
    status: "open",
    probability: 0,
    account: { id: "a1", name: "Acme", type: "prospect", status: "active" },
    stage: { id: "s1", name: "Propuesta", order: 1, isClosedWon: false, isClosedLost: false },
    ...overrides,
  };
}

describe("deals-helpers pipeline fields", () => {
  it("dealCloseDateYmd extrae YYYY-MM-DD", () => {
    expect(dealCloseDateYmd("2026-08-15T00:00:00.000Z")).toBe("2026-08-15");
    expect(dealCloseDateYmd(null)).toBeNull();
  });

  it("formatDealCloseDate formatea en español", () => {
    expect(formatDealCloseDate("2026-08-15")).toBe("15 ago 2026");
  });

  it("formatDealDateCountdown cubre vencida / hoy / futuro", () => {
    expect(formatDealDateCountdown("2026-08-10", "2026-08-14")).toEqual({
      days: -4,
      text: "vencida hace 4 días",
      variant: "danger",
    });
    expect(formatDealDateCountdown("2026-08-14", "2026-08-14")?.text).toBe("hoy");
    expect(formatDealDateCountdown("2026-08-16", "2026-08-14")).toMatchObject({
      days: 2,
      text: "en 2 días",
      variant: "danger",
    });
    expect(formatDealDateCountdown("2026-08-21", "2026-08-14")?.variant).toBe("warn");
    expect(formatDealDateCountdown("2026-09-01", "2026-08-14")?.variant).toBe("neutral");
  });
    expect(getDealCloseDateTone("2026-08-12", "2026-08-14")).toBe("danger");
    expect(getDealCloseDateTone("2026-08-17", "2026-08-14")).toBe("warn");
    expect(getDealCloseDateTone("2026-09-01", "2026-08-14")).toBe("ok");
  });

  it("isOpenDeal respeta status y etapa", () => {
    expect(isOpenDeal(baseDeal())).toBe(true);
    expect(isOpenDeal(baseDeal({ status: "won" }))).toBe(false);
    expect(
      isOpenDeal(
        baseDeal({
          stage: { id: "s2", name: "Ganado", order: 9, isClosedWon: true, isClosedLost: false },
        }),
      ),
    ).toBe(false);
  });

  it("truncateNextStep recorta texto largo", () => {
    const long = "a".repeat(60);
    expect(truncateNextStep(long, 20)?.endsWith("…")).toBe(true);
    expect(truncateNextStep("  Llamar cliente  ")).toBe("Llamar cliente");
  });
});
