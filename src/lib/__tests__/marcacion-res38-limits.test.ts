import { describe, it, expect } from "vitest";
import {
  evaluateOrdinaryJornadaWarnings,
  hoursFromShift,
} from "@/lib/marcacion-jornada-warnings";
import { MARCACION_APPEND_ONLY_ALLOWED_COLUMNS } from "@/lib/marcacion-append-only";
import { getAppVersion } from "@/lib/app-version";

describe("Art. 45.2 jornada ordinaria", () => {
  it("avisa si el día supera 10 h", () => {
    const w = evaluateOrdinaryJornadaWarnings({
      horasDiarias: 12,
      horasSemanales: 36,
      maxHorasSemanales: 42,
    });
    expect(w.some((x) => x.code === "jornada_diaria")).toBe(true);
  });

  it("avisa si la semana supera el tope", () => {
    const w = evaluateOrdinaryJornadaWarnings({
      horasDiarias: 8,
      horasSemanales: 48,
      maxHorasSemanales: 42,
    });
    expect(w.some((x) => x.code === "jornada_semanal")).toBe(true);
  });

  it("no avisa dentro de límites", () => {
    const w = evaluateOrdinaryJornadaWarnings({
      horasDiarias: 8,
      horasSemanales: 40,
      maxHorasSemanales: 42,
    });
    expect(w).toHaveLength(0);
  });

  it("calcula horas de turno nocturno", () => {
    expect(hoursFromShift("22:00", "06:00")).toBe(8);
  });
});

describe("trigger append-only", () => {
  it("lista columnas de auditoría permitidas", () => {
    expect(MARCACION_APPEND_ONLY_ALLOWED_COLUMNS).toContain("deleted_at");
    expect(MARCACION_APPEND_ONLY_ALLOWED_COLUMNS).not.toContain("hash_integridad");
    expect(MARCACION_APPEND_ONLY_ALLOWED_COLUMNS).not.toContain("guardia_id");
  });
});

describe("getAppVersion", () => {
  it("devuelve un string no vacío", () => {
    expect(getAppVersion().length).toBeGreaterThan(0);
  });
});
