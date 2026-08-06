import { describe, expect, it } from "vitest";
import {
  TGR_RUT,
  isPersonaRut,
  isTgrRut,
  normalizeClassifyRut,
  rankClassifySuggestions,
  type GuardiaStateHit,
  type PayrollCandidateHit,
} from "../flow-classify.service";

const GUARDIA_ACTIVO: GuardiaStateHit = {
  status: "active",
  lifecycleStatus: "contratado",
  terminatedAt: null,
  installationName: "Polpaico — Coronel",
  availableExtraShifts: false,
};

const GUARDIA_SIN_PUESTO: GuardiaStateHit = {
  ...GUARDIA_ACTIVO,
  installationName: null,
};

const GUARDIA_FINIQUITADO: GuardiaStateHit = {
  status: "inactive",
  lifecycleStatus: "inactivo",
  terminatedAt: "2026-07-31",
  installationName: null,
  availableExtraShifts: false,
};

describe("normalizeClassifyRut / isTgrRut / isPersonaRut", () => {
  it("normaliza TGR con puntos y guión", () => {
    expect(normalizeClassifyRut("61.808.000-5")).toBe(TGR_RUT);
    expect(isTgrRut(TGR_RUT)).toBe(true);
    expect(isTgrRut("618080005")).toBe(true);
  });

  it("distingue persona (<50M) vs empresa", () => {
    expect(isPersonaRut("123456785")).toBe(true);
    expect(isPersonaRut("256609789")).toBe(true); // 25M persona
    expect(isPersonaRut("761234567")).toBe(false); // 76M empresa (placeholder)
    expect(isPersonaRut(TGR_RUT)).toBe(false);
  });
});

describe("rankClassifySuggestions", () => {
  it("regla gana y trae reason con nombre", () => {
    const s = rankClassifySuggestions({
      beneficiaryRut: TGR_RUT,
      amountAbs: 500_000,
      ruleHit: {
        flowRowId: "row-custom",
        label: "Convenio especial",
        ruleName: "RUT convenio",
        requiresReview: false,
        priority: 10,
      },
      payrollCandidates: [
        {
          kind: "LIQUIDACION",
          guardiaId: "g1",
          amount: 500_000,
          label: "Liquidación jul-26",
          refId: "liq1",
        },
      ],
      dteReceived: { dteId: "dte-1", label: "Prov" },
    });
    expect(s).toHaveLength(1);
    expect(s[0]).toMatchObject({
      kind: "FLOW_ROW",
      flowRowId: "row-custom",
      source: "rule",
      requiresReview: false,
      reason: "Regla «RUT convenio» · prioridad 10",
    });
  });

  it("TGR → solo TGR_PICK con reason", () => {
    const s = rankClassifySuggestions({
      beneficiaryRut: "61.808.000-5",
      amountAbs: 1_200_000,
      teRowId: "row-te",
      guardiaState: GUARDIA_ACTIVO,
      payrollCandidates: [
        {
          kind: "LIQUIDACION",
          guardiaId: "g1",
          amount: 1_200_000,
          label: "Liquidación jul-26",
          refId: "liq1",
        },
      ],
      liquidacionRow: { flowRowId: "row-sueldo", label: "Sueldos líquidos" },
    });
    expect(s).toHaveLength(1);
    expect(s[0]).toMatchObject({
      kind: "TGR_PICK",
      options: ["F29", "FINIQUITO", "CONVENIO_TGR"],
      reason: "Tesorería · requiere elección",
    });
  });

  it("finiquito calza antes que liquidación", () => {
    const candidates: PayrollCandidateHit[] = [
      {
        kind: "LIQUIDACION",
        guardiaId: "g1",
        amount: 800_000,
        label: "Liquidación jul-26",
        refId: "liq1",
      },
      {
        kind: "FINIQUITO",
        guardiaId: "g1",
        amount: 800_000,
        label: "Finiquito 31/07/26",
        refId: "fin1",
      },
    ];
    const s = rankClassifySuggestions({
      beneficiaryRut: "12.345.678-5",
      amountAbs: 800_000,
      amountToleranceClp: 5000,
      guardiaState: GUARDIA_FINIQUITADO,
      payrollCandidates: candidates,
      liquidacionRow: { flowRowId: "row-sueldo", label: "Sueldos líquidos" },
      finiquitoRow: { flowRowId: "row-fin", label: "Finiquitos" },
      teRowId: "row-te",
    });
    expect(s[0]).toMatchObject({
      kind: "FLOW_ROW",
      flowRowId: "row-fin",
      source: "payroll",
      reason: "Finiquito registrado 31/07/26",
    });
  });

  it("liquidación pendiente → Sueldos líquidos", () => {
    const s = rankClassifySuggestions({
      beneficiaryRut: "12.345.678-5",
      amountAbs: 450_000,
      guardiaState: GUARDIA_ACTIVO,
      payrollCandidates: [
        {
          kind: "LIQUIDACION",
          guardiaId: "g1",
          amount: 450_000,
          label: "Liquidación jul-26",
          refId: "liq1",
        },
      ],
      liquidacionRow: {
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
      reason: "Liquidación jul-26 pendiente, calza exacto",
    });
  });

  it("anticipo PENDING → Quincena", () => {
    const s = rankClassifySuggestions({
      beneficiaryRut: "12.345.678-5",
      amountAbs: 200_000,
      guardiaState: GUARDIA_ACTIVO,
      payrollCandidates: [
        {
          kind: "ANTICIPO",
          guardiaId: "g1",
          amount: 200_000,
          label: "Anticipo jul-26",
          refId: "ant1",
        },
      ],
      anticipoRow: {
        flowRowId: "row-quincena",
        label: "Quincena (anticipos)",
      },
      teRowId: "row-te",
    });
    expect(s[0]).toMatchObject({
      kind: "FLOW_ROW",
      flowRowId: "row-quincena",
      source: "payroll",
      reason: "Anticipo pendiente, calza exacto",
    });
  });

  it("guardia activo sin ítem → Turnos extra con reason", () => {
    const s = rankClassifySuggestions({
      beneficiaryRut: "256609789",
      amountAbs: 80_000,
      guardiaState: GUARDIA_ACTIVO,
      payrollCandidates: [],
      teRowId: "row-te",
      teRowLabel: "Turnos extra",
    });
    expect(s[0]).toMatchObject({
      kind: "FLOW_ROW",
      flowRowId: "row-te",
      source: "te",
      label: "Turnos extra",
      reason: "Guardia activo, sin liquidación que calce",
    });
  });

  it("guardia sin puesto → TE con reason específico", () => {
    const s = rankClassifySuggestions({
      beneficiaryRut: "256609789",
      amountAbs: 80_000,
      guardiaState: GUARDIA_SIN_PUESTO,
      teRowId: "row-te",
      teRowLabel: "Turnos extra",
    });
    expect(s[0]).toMatchObject({
      source: "te",
      reason: "Guardia sin puesto activo",
    });
  });

  it("finiquitado sin calce de finiquito → TE", () => {
    const s = rankClassifySuggestions({
      beneficiaryRut: "256609789",
      amountAbs: 50_000,
      guardiaState: GUARDIA_FINIQUITADO,
      payrollCandidates: [
        {
          kind: "FINIQUITO",
          guardiaId: "g1",
          amount: 2_000_000,
          label: "Finiquito 31/07/26",
          refId: "fin1",
        },
      ],
      finiquitoRow: { flowRowId: "row-fin", label: "Finiquitos" },
      teRowId: "row-te",
    });
    expect(s[0]).toMatchObject({
      source: "te",
      reason: "Finiquitado; monto no calza con el finiquito",
    });
  });

  it("isPersonaRut fallback sin guardiaState → TE", () => {
    const s = rankClassifySuggestions({
      beneficiaryRut: "256609789",
      amountAbs: 80_000,
      teRowId: "row-te",
      teRowLabel: "Turnos extra",
    });
    expect(s[0]).toMatchObject({
      kind: "FLOW_ROW",
      source: "te",
      reason: "Persona natural sin liquidación que calce",
    });
  });

  it("proveedor con categoría → FLOW_ROW heuristic", () => {
    const s = rankClassifySuggestions({
      beneficiaryRut: "76.123.456-7",
      amountAbs: 45_000,
      supplierCategoryRow: {
        flowRowId: "row-tel",
        label: "Telefonía",
      },
      supplierCategoryName: "Telefonía",
    });
    expect(s[0]).toMatchObject({
      kind: "FLOW_ROW",
      flowRowId: "row-tel",
      source: "heuristic",
      reason: "Proveedor · categoría Telefonía",
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
      reason: "Factura Proveedor SPA F°123",
    });
  });

  it("sin señales → NONE con reason", () => {
    const s = rankClassifySuggestions({
      beneficiaryRut: null,
      amountAbs: 10_000,
    });
    expect(s[0]).toEqual({
      kind: "NONE",
      reason: "Sin identidad conocida para este RUT",
    });
  });

  it("tolerancia de monto respeta amountToleranceClp", () => {
    const s = rankClassifySuggestions({
      beneficiaryRut: "12.345.678-5",
      amountAbs: 450_000,
      amountToleranceClp: 1000,
      guardiaState: GUARDIA_ACTIVO,
      payrollCandidates: [
        {
          kind: "LIQUIDACION",
          guardiaId: "g1",
          amount: 452_000, // fuera de tol 1000
          label: "Liquidación jul-26",
          refId: "liq1",
        },
      ],
      liquidacionRow: { flowRowId: "row-sueldo", label: "Sueldos" },
      teRowId: "row-te",
    });
    expect(s[0]).toMatchObject({ source: "te" });

    const s2 = rankClassifySuggestions({
      beneficiaryRut: "12.345.678-5",
      amountAbs: 450_000,
      amountToleranceClp: 5000,
      guardiaState: GUARDIA_ACTIVO,
      payrollCandidates: [
        {
          kind: "LIQUIDACION",
          guardiaId: "g1",
          amount: 452_000,
          label: "Liquidación jul-26",
          refId: "liq1",
        },
      ],
      liquidacionRow: { flowRowId: "row-sueldo", label: "Sueldos" },
      teRowId: "row-te",
    });
    expect(s2[0]).toMatchObject({
      source: "payroll",
      flowRowId: "row-sueldo",
    });
  });
});
