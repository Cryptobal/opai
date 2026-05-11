import { describe, it, expect } from "vitest";
import {
  weekEndForClosing,
  weekStartForClosing,
  bucketKeyFor,
  bucketBoundsFor,
} from "../recurrence-engine";

describe("recurrence-engine · weekly close", () => {
  it("weekEndForClosing devuelve el viernes de la semana de un lunes", () => {
    const lun = new Date("2026-05-11T10:00:00Z"); // lunes
    const result = weekEndForClosing(lun, 5);
    expect(result.toISOString().slice(0, 10)).toBe("2026-05-15");
  });

  it("weekEndForClosing devuelve el mismo día si ya es viernes", () => {
    const vie = new Date("2026-05-15T10:00:00Z");
    const result = weekEndForClosing(vie, 5);
    expect(result.toISOString().slice(0, 10)).toBe("2026-05-15");
  });

  it("weekStartForClosing devuelve el sábado anterior (cierre viernes)", () => {
    const vie = new Date("2026-05-15T10:00:00Z");
    const result = weekStartForClosing(vie, 5);
    expect(result.toISOString().slice(0, 10)).toBe("2026-05-09");
  });

  it("bucketKeyFor con weekClosingDow=5 produce key alineada al viernes", () => {
    const lun = new Date("2026-05-11");
    const key = bucketKeyFor(lun, "weekly", 5);
    expect(key).toBe("WK-20260515");
  });

  it("bucketKeyFor sin weekClosingDow conserva comportamiento ISO", () => {
    const lun = new Date("2026-05-11");
    const key = bucketKeyFor(lun, "weekly");
    expect(key).toMatch(/^\d{4}-W\d{2}$/);
  });

  it("bucketBoundsFor con cierre viernes devuelve sábado→viernes", () => {
    const mid = new Date("2026-05-13");
    const { start, end, label } = bucketBoundsFor(mid, "weekly", 5);
    expect(start.toISOString().slice(0, 10)).toBe("2026-05-09");
    expect(end.toISOString().slice(0, 10)).toBe("2026-05-15");
    expect(label).toMatch(/Vie/);
  });
});
