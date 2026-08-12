import { describe, expect, it } from "vitest";
import {
  dealCloseDateYmd,
  formatDealCloseDate,
  getDealCloseDateTone,
  isOpenDeal,
  truncateProximoPaso,
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

  it("getDealCloseDateTone marca vencido y próximo", () => {
    const past = new Date();
    past.setDate(past.getDate() - 2);
    const ymdPast = past.toISOString().slice(0, 10);
    expect(getDealCloseDateTone(ymdPast)).toBe("danger");

    const soon = new Date();
    soon.setDate(soon.getDate() + 3);
    expect(getDealCloseDateTone(soon.toISOString().slice(0, 10))).toBe("warn");
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

  it("truncateProximoPaso recorta texto largo", () => {
    const long = "a".repeat(60);
    expect(truncateProximoPaso(long, 20)?.endsWith("…")).toBe(true);
    expect(truncateProximoPaso("  Llamar cliente  ")).toBe("Llamar cliente");
  });
});
