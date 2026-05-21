import { describe, expect, it } from "vitest";
import {
  buildCommonSubjectTokens,
  formatMonthYearEs,
  sanitizeSubject,
} from "../subject-tokens";

describe("formatMonthYearEs", () => {
  it("formatea mes capitalizado + año sin 'de'", () => {
    // UTC midnight del 20 de mayo 2026 → 21 horas atrás en Chile, sigue
    // siendo mayo. Usamos mediodía UTC para evitar volatilidad.
    const d = new Date("2026-05-20T12:00:00.000Z");
    expect(formatMonthYearEs(d)).toBe("Mayo 2026");
  });

  it("funciona para enero", () => {
    const d = new Date("2026-01-15T12:00:00.000Z");
    expect(formatMonthYearEs(d)).toBe("Enero 2026");
  });
});

describe("sanitizeSubject", () => {
  it("colapsa separadores cuando token central es vacío", () => {
    expect(sanitizeSubject("Proforma - Cliente -  - Mayo 2026")).toBe(
      "Proforma - Cliente - Mayo 2026",
    );
  });

  it("limpia guiones colgantes al inicio/fin", () => {
    expect(sanitizeSubject(" - Cliente - Mayo 2026 - ")).toBe(
      "Cliente - Mayo 2026",
    );
  });

  it("no toca contenido legítimo con un solo guión entre tokens", () => {
    expect(sanitizeSubject("Proforma - Polpaico - Mayo 2026")).toBe(
      "Proforma - Polpaico - Mayo 2026",
    );
  });

  it("colapsa espacios múltiples", () => {
    expect(sanitizeSubject("Proforma    Polpaico")).toBe("Proforma Polpaico");
  });

  it("maneja triple guión vacío seguido", () => {
    expect(sanitizeSubject("Factura -  -  - Mayo 2026")).toBe(
      "Factura - Mayo 2026",
    );
  });
});

describe("buildCommonSubjectTokens", () => {
  it("expone cliente, razonSocial alias, instalacion, mes, fecha", () => {
    const tokens = buildCommonSubjectTokens({
      receiverName: "Polpaico Mejillones",
      installationName: "Planta A",
      date: new Date("2026-05-20T12:00:00.000Z"),
    });
    expect(tokens.cliente).toBe("Polpaico Mejillones");
    expect(tokens.razonSocial).toBe("Polpaico Mejillones");
    expect(tokens.instalacion).toBe("Planta A");
    expect(tokens.mes).toBe("Mayo 2026");
    expect(tokens.fecha).toBe("2026-05-20");
  });

  it("instalacion vacía cuando installationName es null", () => {
    const tokens = buildCommonSubjectTokens({
      receiverName: "Polpaico",
      installationName: null,
      date: new Date("2026-05-20T12:00:00.000Z"),
    });
    expect(tokens.instalacion).toBe("");
  });
});
