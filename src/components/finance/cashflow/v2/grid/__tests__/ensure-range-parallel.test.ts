import { describe, it, expect } from "vitest";
import {
  addWeeksUTC,
  capGapWeeks,
  FETCH_CHUNK_WEEKS,
  findMissingGap,
  startOfIsoWeekUTC,
  weekKey,
} from "../week-keys";

/** Lunes de una semana de referencia fija (2026-W27 ≈ 29 jun 2026). */
const W27 = startOfIsoWeekUTC(new Date(Date.UTC(2026, 5, 29)));

function keysFor(...offsets: number[]): Set<string> {
  return new Set(offsets.map((n) => weekKey(addWeeksUTC(W27, n))));
}

describe("findMissingGap", () => {
  it("sin huecos → null", () => {
    const present = keysFor(0, 1, 2, 3);
    const gap = findMissingGap(
      present,
      W27,
      addWeeksUTC(W27, 3),
      false,
    );
    expect(gap).toBeNull();
  });

  it("hueco al inicio", () => {
    const present = keysFor(2, 3);
    const gap = findMissingGap(
      present,
      W27,
      addWeeksUTC(W27, 3),
      false,
    );
    expect(gap).not.toBeNull();
    expect(weekKey(gap!.first)).toBe(weekKey(W27));
    expect(weekKey(gap!.last)).toBe(weekKey(addWeeksUTC(W27, 1)));
  });

  it("hueco en el medio", () => {
    const present = keysFor(0, 3);
    const gap = findMissingGap(
      present,
      W27,
      addWeeksUTC(W27, 3),
      false,
    );
    expect(gap).not.toBeNull();
    expect(weekKey(gap!.first)).toBe(weekKey(addWeeksUTC(W27, 1)));
    expect(weekKey(gap!.last)).toBe(weekKey(addWeeksUTC(W27, 2)));
  });

  it("huecos discontinuos → solo el primer contiguo", () => {
    // Presente: 0 y 3. Falta 1–2, luego 4. No debe abarcar hasta 4.
    const present = keysFor(0, 3);
    const gap = findMissingGap(
      present,
      W27,
      addWeeksUTC(W27, 4),
      false,
    );
    expect(gap).not.toBeNull();
    expect(weekKey(gap!.first)).toBe(weekKey(addWeeksUTC(W27, 1)));
    expect(weekKey(gap!.last)).toBe(weekKey(addWeeksUTC(W27, 2)));
  });

  it("hueco al final", () => {
    const present = keysFor(0, 1);
    const gap = findMissingGap(
      present,
      W27,
      addWeeksUTC(W27, 3),
      false,
    );
    expect(gap).not.toBeNull();
    expect(weekKey(gap!.first)).toBe(weekKey(addWeeksUTC(W27, 2)));
    expect(weekKey(gap!.last)).toBe(weekKey(addWeeksUTC(W27, 3)));
  });

  it("stale=true → toda la ventana es hueco aunque las keys existan", () => {
    const present = keysFor(0, 1, 2, 3);
    const gap = findMissingGap(
      present,
      W27,
      addWeeksUTC(W27, 3),
      true,
    );
    expect(gap).not.toBeNull();
    expect(weekKey(gap!.first)).toBe(weekKey(W27));
    expect(weekKey(gap!.last)).toBe(weekKey(addWeeksUTC(W27, 3)));
  });
});

describe("capGapWeeks", () => {
  it(`recorta a ${FETCH_CHUNK_WEEKS} semanas`, () => {
    const gap = {
      first: W27,
      last: addWeeksUTC(W27, 20),
    };
    const capped = capGapWeeks(gap);
    expect(weekKey(capped.first)).toBe(weekKey(W27));
    expect(weekKey(capped.last)).toBe(
      weekKey(addWeeksUTC(W27, FETCH_CHUNK_WEEKS - 1)),
    );
  });

  it("no alarga huecos cortos", () => {
    const gap = { first: W27, last: addWeeksUTC(W27, 1) };
    const capped = capGapWeeks(gap);
    expect(weekKey(capped.last)).toBe(weekKey(addWeeksUTC(W27, 1)));
  });
});
