/** Tests B6: merge de intervalos, conflictos y sugerencias de slots comunes. */
import { describe, it, expect } from "vitest";
import {
  mergeBusyIntervals,
  findConflicts,
  suggestCommonFreeSlots,
} from "../calendar-intervals";

const d = (iso: string) => new Date(iso);

describe("mergeBusyIntervals", () => {
  it("fusiona solapados y contiguos, descarta vacíos", () => {
    const merged = mergeBusyIntervals([
      { start: d("2026-07-22T13:00:00Z"), end: d("2026-07-22T14:00:00Z"), title: "A" },
      { start: d("2026-07-22T13:30:00Z"), end: d("2026-07-22T15:00:00Z"), title: "B" },
      { start: d("2026-07-22T15:00:00Z"), end: d("2026-07-22T16:00:00Z") },
      { start: d("2026-07-22T18:00:00Z"), end: d("2026-07-22T18:00:00Z") }, // vacío
      { start: d("2026-07-22T19:00:00Z"), end: d("2026-07-22T20:00:00Z") },
    ]);
    expect(merged).toHaveLength(2);
    expect(merged[0].start.toISOString()).toBe("2026-07-22T13:00:00.000Z");
    expect(merged[0].end.toISOString()).toBe("2026-07-22T16:00:00.000Z");
    expect(merged[0].title).toBe("A");
  });

  it("mantiene intervalos disjuntos ordenados", () => {
    const merged = mergeBusyIntervals([
      { start: d("2026-07-22T18:00:00Z"), end: d("2026-07-22T19:00:00Z") },
      { start: d("2026-07-22T12:00:00Z"), end: d("2026-07-22T13:00:00Z") },
    ]);
    expect(merged.map((m) => m.start.getUTCHours())).toEqual([12, 18]);
  });
});

describe("findConflicts", () => {
  const busy = [{ start: d("2026-07-22T15:00:00Z"), end: d("2026-07-22T16:00:00Z"), title: "X" }];

  it("detecta solape parcial", () => {
    expect(findConflicts(busy, d("2026-07-22T15:30:00Z"), d("2026-07-22T17:00:00Z"))).toHaveLength(1);
  });

  it("bordes exactos no son conflicto", () => {
    expect(findConflicts(busy, d("2026-07-22T16:00:00Z"), d("2026-07-22T17:00:00Z"))).toHaveLength(0);
    expect(findConflicts(busy, d("2026-07-22T14:00:00Z"), d("2026-07-22T15:00:00Z"))).toHaveLength(0);
  });
});

describe("suggestCommonFreeSlots", () => {
  it("propone slots 08-19 Chile libres para todos", () => {
    // 22 jul 2026 (invierno, Chile -04): 08:00 Chile = 12:00Z.
    const busyA = [{ start: d("2026-07-22T12:00:00Z"), end: d("2026-07-22T13:00:00Z") }]; // 08-09
    const busyB = [{ start: d("2026-07-22T13:00:00Z"), end: d("2026-07-22T14:00:00Z") }]; // 09-10
    const out = suggestCommonFreeSlots([busyA, busyB], d("2026-07-22T11:00:00Z"), 60, 4);
    expect(out.length).toBe(4);
    // Primer hueco común: 10:00 Chile = 14:00Z.
    expect(out[0].start.toISOString()).toBe("2026-07-22T14:00:00.000Z");
    // Ninguna sugerencia pisa un busy.
    for (const s of out) {
      expect(findConflicts([...busyA, ...busyB], s.start, s.end)).toHaveLength(0);
    }
  });

  it("día completamente ocupado empuja al día siguiente", () => {
    const fullDay = [{ start: d("2026-07-22T11:00:00Z"), end: d("2026-07-23T00:00:00Z") }];
    const out = suggestCommonFreeSlots([fullDay], d("2026-07-22T11:00:00Z"), 60, 1);
    expect(out.length).toBe(1);
    expect(out[0].start.toISOString()).toBe("2026-07-23T12:00:00.000Z"); // 08:00 Chile día 23
  });
});
