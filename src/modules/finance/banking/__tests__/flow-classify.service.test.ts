import { describe, expect, it } from "vitest";
import {
  TGR_RUT,
  isPersonaRut,
  isTgrRut,
  normalizeClassifyRut,
  rankClassifySuggestions,
} from "../flow-classify.service";

describe("normalizeClassifyRut / isTgrRut / isPersonaRut", () => {
  it("normaliza TGR con puntos y guión", () => {
    expect(normalizeClassifyRut("61.808.000-5")).toBe(TGR_RUT);
    expect(isTgrRut(TGR_RUT)).toBe(true);
    expect(isTgrRut("618080005")).toBe(true);
  });

  it("distingue persona (<50M) vs empresa", () => {
    expect(isPersonaRut("123456785")).toBe(true);
    expect(isPersonaRut("256609789")).toBe(true); // 25M persona
    expect(isPersonaRut("760835072")).toBe(false); // 76M empresa
    expect(isPersonaRut(TGR_RUT)).toBe(false);
  });
});

describe("rankClassifySuggestions", () => {
  it("TGR → solo TGR_PICK", () => {
    const s = rankClassifySuggestions({
      beneficiaryRut: "61.808.000-5",
      amountAbs: 1_200_000,
      teRowId: "row-te",
      payrollItem: { flowRowId: "row-sueldo", label: "Sueldos" },
    });
    expect(s).toHaveLength(1);
    expect(s[0]).toMatchObject({
      kind: "TGR_PICK",
      options: ["F29", "FINIQUITO", "CONVENIO_TGR"],
    });
  });

  it("persona + liquidación pendiente → FLOW_ROW payroll", () => {
    const s = rankClassifySuggestions({
      beneficiaryRut: "12.345.678-5",
      amountAbs: 450_000,
      payrollItem: {
        flowRowId: "row-liquido",
        label: "Sueldos líquidos",
      },
      teRowId: "row-te",
    });
    expect(s[0]).toMatchObject({
      kind: "FLOW_ROW",
      flowRowId: "row-liquido",
      source: "payroll",
      requiresReview: true,
    });
  });

  it("persona sin ítem → sugiere Turnos extra", () => {
    const s = rankClassifySuggestions({
      beneficiaryRut: "256609789",
      amountAbs: 80_000,
      teRowId: "row-te",
      teRowLabel: "Turnos extra",
    });
    expect(s[0]).toMatchObject({
      kind: "FLOW_ROW",
      flowRowId: "row-te",
      source: "te",
      label: "Turnos extra",
    });
  });

  it("regla RUT gana sobre TGR / nómina / DTE", () => {
    const s = rankClassifySuggestions({
      beneficiaryRut: TGR_RUT,
      amountAbs: 500_000,
      ruleHit: {
        flowRowId: "row-custom",
        label: "Convenio especial",
        requiresReview: false,
      },
      payrollItem: { flowRowId: "row-x", label: "X" },
      dteReceived: { dteId: "dte-1", label: "Prov" },
    });
    expect(s).toHaveLength(1);
    expect(s[0]).toMatchObject({
      kind: "FLOW_ROW",
      flowRowId: "row-custom",
      source: "rule",
      requiresReview: false,
    });
  });

  it("empresa + DTE recibido → DTE_RECEIVED", () => {
    const s = rankClassifySuggestions({
      beneficiaryRut: "76.123.456-7", // placeholder allowlist check-pii
      amountAbs: 2_380_000,
      dteReceived: {
        dteId: "dte-recv-1",
        label: "Proveedor SPA F°123",
      },
      teRowId: "row-te",
    });
    expect(s[0]).toMatchObject({
      kind: "DTE_RECEIVED",
      dteId: "dte-recv-1",
    });
  });

  it("sin señales → NONE", () => {
    const s = rankClassifySuggestions({
      beneficiaryRut: null,
      amountAbs: 10_000,
    });
    expect(s[0]).toEqual({ kind: "NONE" });
  });
});
