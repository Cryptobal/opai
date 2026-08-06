import { describe, it, expect } from "vitest";
import {
  pickBalanceAnchor,
  shouldApplyImportClosingBalance,
} from "../bank-balance.service";

describe("pickBalanceAnchor", () => {
  it("elige el de fecha más reciente", () => {
    const a = pickBalanceAnchor([
      {
        balance: 100,
        asOfDate: new Date("2026-08-06"),
        source: "IMPORT",
        createdAt: new Date("2026-08-06T12:00:00Z"),
      },
      {
        balance: 50,
        asOfDate: new Date("2026-08-05"),
        source: "MANUAL",
        createdAt: new Date("2026-08-05T12:00:00Z"),
      },
    ]);
    expect(a?.balance).toBe(100);
    expect(a?.source).toBe("IMPORT");
  });

  it("en misma fecha prefiere MANUAL sobre IMPORT más nuevo", () => {
    const a = pickBalanceAnchor([
      {
        balance: 3_999_000,
        asOfDate: new Date("2026-08-06"),
        source: "IMPORT",
        createdAt: new Date("2026-08-06T18:00:00Z"),
      },
      {
        balance: 17_000_000,
        asOfDate: new Date("2026-08-06"),
        source: "MANUAL",
        createdAt: new Date("2026-08-06T10:00:00Z"),
      },
    ]);
    expect(a?.balance).toBe(17_000_000);
    expect(a?.source).toBe("MANUAL");
  });

  it("sin candidatos devuelve null", () => {
    expect(pickBalanceAnchor([])).toBeNull();
  });
});

describe("shouldApplyImportClosingBalance", () => {
  it("aplica si no hay manual protector", () => {
    expect(
      shouldApplyImportClosingBalance({
        importAsOfDate: new Date("2026-08-05"),
        protectingManualAsOfDate: null,
      }),
    ).toBe(true);
  });

  it("no aplica si manual es del mismo día o más nuevo", () => {
    expect(
      shouldApplyImportClosingBalance({
        importAsOfDate: new Date("2026-08-05"),
        protectingManualAsOfDate: new Date("2026-08-05"),
      }),
    ).toBe(false);
    expect(
      shouldApplyImportClosingBalance({
        importAsOfDate: new Date("2026-08-05"),
        protectingManualAsOfDate: new Date("2026-08-06"),
      }),
    ).toBe(false);
  });

  it("aplica si la cartola es estrictamente más nueva que el manual", () => {
    expect(
      shouldApplyImportClosingBalance({
        importAsOfDate: new Date("2026-08-07"),
        protectingManualAsOfDate: new Date("2026-08-06"),
      }),
    ).toBe(true);
  });
});
