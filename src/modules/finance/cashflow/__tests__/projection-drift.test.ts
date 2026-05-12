import { describe, it, expect } from "vitest";

/**
 * Test puro de la lógica de cumulativePoints. La función no está extraída,
 * vive inline en buildProjection. Replicamos la lógica acá para verificar
 * el contrato de drift.
 */
function computeCumulative(
  buckets: Array<{ key: string; start: Date; net: number; actualBankNet: number }>,
  opening: number,
  today: Date,
) {
  let runningP = opening;
  let runningR = opening;
  let lastIdx = -1;
  const points = buckets.map((b, idx) => {
    runningP += b.net;
    const past = b.start.getTime() <= today.getTime();
    if (past) {
      runningR += b.actualBankNet;
      lastIdx = idx;
      return {
        bucketKey: b.key,
        projectedClp: runningP,
        realBankClp: runningR,
        cumulativeBankVarianceClp: runningR - runningP,
      };
    }
    return {
      bucketKey: b.key,
      projectedClp: runningP,
      realBankClp: null as number | null,
      cumulativeBankVarianceClp: null as number | null,
    };
  });
  const currentDrift =
    lastIdx >= 0 ? points[lastIdx].cumulativeBankVarianceClp : null;
  return { points, currentDrift };
}

describe("cumulativePoints", () => {
  it("calcula projected, real y drift correctamente", () => {
    const buckets = [
      { key: "W1", start: new Date("2026-04-27"), net: 100, actualBankNet: 90 },
      { key: "W2", start: new Date("2026-05-04"), net: 50, actualBankNet: 60 },
      { key: "W3", start: new Date("2026-05-11"), net: 200, actualBankNet: 0 },
      { key: "W4", start: new Date("2026-05-18"), net: 300, actualBankNet: 0 },
    ];
    const today = new Date("2026-05-12");
    const opening = 1000;

    const { points, currentDrift } = computeCumulative(buckets, opening, today);

    expect(points[0].cumulativeBankVarianceClp).toBe(-10);
    expect(points[1].cumulativeBankVarianceClp).toBe(0);
    expect(points[2].cumulativeBankVarianceClp).toBe(-200);
    expect(points[3].cumulativeBankVarianceClp).toBeNull();
    expect(points[3].realBankClp).toBeNull();
    expect(currentDrift).toBe(-200);
  });

  it("currentDrift es null si todos los buckets son futuros", () => {
    const buckets = [
      { key: "W1", start: new Date("2026-06-01"), net: 100, actualBankNet: 0 },
    ];
    const today = new Date("2026-05-12");
    const { points, currentDrift } = computeCumulative(buckets, 1000, today);

    expect(currentDrift).toBeNull();
    expect(points[0].realBankClp).toBeNull();
    expect(points[0].cumulativeBankVarianceClp).toBeNull();
  });

  it("drift positivo cuando banco tiene más que proyectado", () => {
    const buckets = [
      { key: "W1", start: new Date("2026-05-04"), net: 100, actualBankNet: 200 },
    ];
    const { currentDrift } = computeCumulative(buckets, 0, new Date("2026-05-12"));
    expect(currentDrift).toBe(100);
  });
});
