import { describe, it, expect } from "vitest";
import {
  firstBusinessDayOfMonth,
  lastBusinessDayOfMonth,
  firstMondayOfMonth,
} from "../business-days";

describe("first/lastBusinessDayOfMonth (CL — sin feriados, solo sábado/domingo)", () => {
  it("Mayo 2026: día 1 = viernes, primer hábil = 1", () => {
    const d = firstBusinessDayOfMonth(2026, 5);
    expect(d.getDate()).toBe(1);
  });

  it("Marzo 2026: día 1 = domingo, primer hábil = lunes 2", () => {
    const d = firstBusinessDayOfMonth(2026, 3);
    expect(d.getDate()).toBe(2);
  });

  it("Agosto 2026: día 1 = sábado, primer hábil = lunes 3", () => {
    const d = firstBusinessDayOfMonth(2026, 8);
    expect(d.getDate()).toBe(3);
  });

  it("Mayo 2026: último hábil = viernes 29 (30 sáb, 31 dom)", () => {
    const d = lastBusinessDayOfMonth(2026, 5);
    expect(d.getDate()).toBe(29);
  });

  it("Mayo 2026: primer lunes = 4", () => {
    const d = firstMondayOfMonth(2026, 5);
    expect(d.getDate()).toBe(4);
  });

  it("Marzo 2026: día 1 = domingo, primer lunes = 2", () => {
    const d = firstMondayOfMonth(2026, 3);
    expect(d.getDate()).toBe(2);
  });
});
