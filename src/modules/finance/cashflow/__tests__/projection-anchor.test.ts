import { describe, it, expect } from "vitest";

/**
 * Test puro de la lógica de runningProjected con anchor del cierre semanal.
 * Replica la lógica que vive inline en buildProjection (projection.service.ts)
 * para verificar el contrato:
 *  - Sin anchor: runningProjected parte de `opening` y suma b.net por bucket.
 *  - Con anchor + buckets post-anchor: el primer post-anchor parte de
 *    anchorBalance + b.net; los siguientes suman b.net.
 *  - Con anchor + buckets pre-anchor: muestran realBankClp como projectedClp
 *    y cumulativeBankVarianceClp = 0 (pre-anchor está cuadrado por definición).
 */
function computeAnchoredCumulative(
  buckets: Array<{ key: string; start: Date; end: Date; net: number }>,
  opening: number,
  anchorBalance: number | null,
  anchorDate: Date | null,
  today: Date,
  realBankByCutoff: Map<number, number | null>,
) {
  let runningProjected = anchorBalance ?? opening;
  let crossedAnchor = anchorDate === null;
  let lastRealBucketIdx = -1;

  const points = buckets.map((b, idx) => {
    const isPastOrCurrent = b.start.getTime() <= today.getTime();
    const cutoff = b.end.getTime() <= today.getTime() ? b.end : today;
    const realBank = realBankByCutoff.get(cutoff.getTime()) ?? null;

    // Caso A: pre-anchor
    if (anchorDate !== null && b.end.getTime() <= anchorDate.getTime()) {
      if (realBank !== null) runningProjected = realBank;
      lastRealBucketIdx = idx;
      return {
        bucketKey: b.key,
        projectedClp: realBank ?? runningProjected,
        realBankClp: realBank,
        cumulativeBankVarianceClp: 0,
      };
    }

    // Caso B: cruza anchor o primer post-anchor
    if (!crossedAnchor && anchorDate !== null && b.start.getTime() <= anchorDate.getTime()) {
      runningProjected = (anchorBalance as number) + b.net;
      crossedAnchor = true;
    } else if (!crossedAnchor && anchorDate !== null && b.start.getTime() > anchorDate.getTime()) {
      runningProjected = (anchorBalance as number) + b.net;
      crossedAnchor = true;
    } else {
      runningProjected += b.net;
    }

    if (!isPastOrCurrent) {
      return {
        bucketKey: b.key,
        projectedClp: runningProjected,
        realBankClp: null,
        cumulativeBankVarianceClp: null,
      };
    }

    lastRealBucketIdx = idx;
    return {
      bucketKey: b.key,
      projectedClp: runningProjected,
      realBankClp: realBank,
      cumulativeBankVarianceClp:
        realBank !== null ? realBank - runningProjected : null,
    };
  });

  return points;
}

describe("projection runningProjected with anchor", () => {
  it("sin anchor: parte de opening y suma net (comportamiento previo)", () => {
    const buckets = [
      { key: "W1", start: new Date("2026-05-04"), end: new Date("2026-05-10"), net: 100 },
      { key: "W2", start: new Date("2026-05-11"), end: new Date("2026-05-17"), net: 200 },
      { key: "W3", start: new Date("2026-05-18"), end: new Date("2026-05-24"), net: -50 },
    ];
    const today = new Date("2026-05-13");
    const opening = 1000;
    const realByCutoff = new Map<number, number | null>([
      [new Date("2026-05-10").getTime(), 1090],
      [today.getTime(), 1280],
    ]);

    const points = computeAnchoredCumulative(buckets, opening, null, null, today, realByCutoff);
    expect(points[0].projectedClp).toBe(1100);
    expect(points[1].projectedClp).toBe(1300);
    expect(points[2].projectedClp).toBe(1250);
    expect(points[2].realBankClp).toBeNull();
    expect(points[0].realBankClp).toBe(1090);
    expect(points[0].cumulativeBankVarianceClp).toBe(-10);
  });

  it("con anchor y todos los buckets post-anchor: primer bucket parte de anchorBalance + b.net", () => {
    const anchorDate = new Date("2026-05-03");
    const buckets = [
      { key: "W1", start: new Date("2026-05-04"), end: new Date("2026-05-10"), net: 100 },
      { key: "W2", start: new Date("2026-05-11"), end: new Date("2026-05-17"), net: 200 },
      { key: "W3", start: new Date("2026-05-18"), end: new Date("2026-05-24"), net: -50 },
    ];
    const today = new Date("2026-05-13");
    const opening = 1000;
    const anchorBalance = 5000;
    const realByCutoff = new Map<number, number | null>();

    const points = computeAnchoredCumulative(
      buckets, opening, anchorBalance, anchorDate, today, realByCutoff,
    );
    // Bucket 1 (post-anchor) parte de anchorBalance + net
    expect(points[0].projectedClp).toBe(5100);
    expect(points[1].projectedClp).toBe(5300);
    expect(points[2].projectedClp).toBe(5250);
    // opening (1000) NO se usa cuando hay anchor
    expect(points[0].projectedClp).not.toBe(1100);
  });

  it("con anchor pre-anchor: bucket congelado muestra real bank como projected y variance 0", () => {
    const anchorDate = new Date("2026-05-10"); // fin de W1
    const buckets = [
      { key: "W1", start: new Date("2026-05-04"), end: new Date("2026-05-10"), net: 100 },
      { key: "W2", start: new Date("2026-05-11"), end: new Date("2026-05-17"), net: 200 },
    ];
    const today = new Date("2026-05-13");
    const opening = 1000;
    const anchorBalance = 5000;
    // W1 cierra en 2026-05-10, su realBank histórico es 4800
    const realByCutoff = new Map<number, number | null>([
      [new Date("2026-05-10").getTime(), 4800],
      [today.getTime(), 4950],
    ]);

    const points = computeAnchoredCumulative(
      buckets, opening, anchorBalance, anchorDate, today, realByCutoff,
    );
    // W1 pre-anchor: muestra real bank, drift = 0
    expect(points[0].projectedClp).toBe(4800);
    expect(points[0].realBankClp).toBe(4800);
    expect(points[0].cumulativeBankVarianceClp).toBe(0);
    // W2 post-anchor: parte de anchorBalance + b.net
    expect(points[1].projectedClp).toBe(5200);
  });

  it("anchor entre buckets: el primero post-anchor (start > anchorDate) parte de anchor", () => {
    const anchorDate = new Date("2026-05-10");
    const buckets = [
      // W1 termina antes del anchor → pre-anchor
      { key: "W1", start: new Date("2026-04-27"), end: new Date("2026-05-03"), net: 50 },
      // W2 termina exactamente en el anchor → pre-anchor
      { key: "W2", start: new Date("2026-05-04"), end: new Date("2026-05-10"), net: 100 },
      // W3 empieza después del anchor → primer post-anchor
      { key: "W3", start: new Date("2026-05-11"), end: new Date("2026-05-17"), net: 200 },
      // W4 sigue post-anchor → suma normal
      { key: "W4", start: new Date("2026-05-18"), end: new Date("2026-05-24"), net: 30 },
    ];
    const today = new Date("2026-05-13");
    const realByCutoff = new Map<number, number | null>([
      [new Date("2026-05-03").getTime(), 4900],
      [new Date("2026-05-10").getTime(), 5000],
      [today.getTime(), 5180],
    ]);
    const anchorBalance = 5000;

    const points = computeAnchoredCumulative(
      buckets, 1000, anchorBalance, anchorDate, today, realByCutoff,
    );
    // Pre-anchor buckets: real bank + variance 0
    expect(points[0].cumulativeBankVarianceClp).toBe(0);
    expect(points[1].cumulativeBankVarianceClp).toBe(0);
    // W3 (primer post-anchor): anchor + net = 5200
    expect(points[2].projectedClp).toBe(5200);
    // W4 sigue sumando net normal
    expect(points[3].projectedClp).toBe(5230);
  });
});
