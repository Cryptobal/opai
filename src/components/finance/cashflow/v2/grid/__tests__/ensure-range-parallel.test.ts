import { describe, it, expect } from "vitest";
import {
  addWeeksUTC,
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
