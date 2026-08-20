import { describe, it, expect } from "vitest";
import {
  isAmountNearUfExpected,
  pickNearestUfExpected,
  ufAmountToleranceClp,
} from "../uf-amount-near";
import { computeCellExecution } from "../residual";
import { ufToClp } from "../uf-occurrence";

describe("isAmountNearUfExpected", () => {
  const uf = 39_000;
  const amountUf = 24.5;
  const expected = ufToClp(amountUf, uf);

  it("acepta un cargo cercano (5% o tolerancia CLP)", () => {
    expect(isAmountNearUfExpected(expected, expected)).toBe(true);
    expect(isAmountNearUfExpected(expected + 10_000, expected)).toBe(true);
    expect(ufAmountToleranceClp(expected)).toBe(Math.round(expected * 0.05));
  });

  it("rechaza un monto lejano", () => {
    expect(isAmountNearUfExpected(2_000_000, expected)).toBe(false);
  });
});

describe("pickNearestUfExpected", () => {
  it("elige la ocurrencia más cercana a la fecha del banco", () => {
    const nearest = pickNearestUfExpected("2026-08-18", [
      { occurrenceYmd: "2026-07-15", expectedClp: 1 },
      { occurrenceYmd: "2026-08-15", expectedClp: 2 },
      { occurrenceYmd: "2026-09-15", expectedClp: 3 },
    ]);
    expect(nearest?.expectedClp).toBe(2);
  });
});

describe("celda pagada vs parcial (residual)", () => {
  const plan = 955_500;

  it("monto similar → complete", () => {
    const { execution } = computeCellExecution({
      section: "GAV",
      plan,
      committedTotal: 0,
      committedNet: 0,
      invoiced: false,
      realSigned: -plan,
      settlement: "AUTO",
      residualCarryEnabled: true,
      residualMinClp: 10_000,
    });
    expect(execution.state).toBe("complete");
    expect(isAmountNearUfExpected(plan, plan)).toBe(true);
  });

  it("monto lejano clasifica igual pero la celda queda over", () => {
    const { execution } = computeCellExecution({
      section: "GAV",
      plan,
      committedTotal: 0,
      committedNet: 0,
      invoiced: false,
      realSigned: -2_000_000,
      settlement: "AUTO",
      residualCarryEnabled: true,
      residualMinClp: 10_000,
    });
    expect(execution.state).toBe("over");
    expect(isAmountNearUfExpected(2_000_000, plan)).toBe(false);
  });
});
