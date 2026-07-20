import { describe, expect, it } from "vitest";
import { WEEKDAY_ORDER } from "@/lib/cpq/weekdays";
import { analizarTurno, defaultDiasForRol } from "./shift-utils";

describe("defaultDiasForRol", () => {
  it("rotativos → 7 días", () => {
    expect(defaultDiasForRol("4x4")).toEqual([...WEEKDAY_ORDER]);
    expect(defaultDiasForRol("7x7")).toEqual([...WEEKDAY_ORDER]);
    expect(defaultDiasForRol("14x14")).toEqual([...WEEKDAY_ORDER]);
  });

  it("5x2 → Lun-Vie", () => {
    expect(defaultDiasForRol("5x2")).toEqual(["Lun", "Mar", "Mié", "Jue", "Vie"]);
  });

  it("6x1 → Lun-Sáb", () => {
    expect(defaultDiasForRol("6x1")).toEqual([
      "Lun",
      "Mar",
      "Mié",
      "Jue",
      "Vie",
      "Sáb",
    ]);
  });

  it("2x5 → Sáb-Dom", () => {
    expect(defaultDiasForRol("2x5")).toEqual(["Sáb", "Dom"]);
  });

  it("sin patrón NxN → null", () => {
    expect(defaultDiasForRol("Custom")).toBeNull();
    expect(defaultDiasForRol(null)).toBeNull();
  });
});

describe("analizarTurno — Fer no suma horas", () => {
  it("mismas horas con o sin Fer", () => {
    const base = {
      inicio: "08:00",
      fin: "20:00",
      rolName: "5x2",
    };
    const sinFer = analizarTurno({
      ...base,
      dias: ["Lun", "Mar", "Mié", "Jue", "Vie"],
    });
    const conFer = analizarTurno({
      ...base,
      dias: ["Lun", "Mar", "Mié", "Jue", "Vie", "Fer"],
    });
    expect(conFer.horasSemana).toBe(sinFer.horasSemana);
    expect(conFer.horasEfectivasDia).toBe(sinFer.horasEfectivasDia);
  });
});
