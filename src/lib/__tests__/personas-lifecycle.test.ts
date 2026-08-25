import { describe, expect, it } from "vitest";
import {
  CANCEL_HIRE_REASON,
  canCancelHireFromCounts,
  computeFiniquitoSettlement,
  isAllowedLifecycleTransition,
  isCancelledHireRecord,
  isClosingInstallationStatus,
  isSignedLaborContractDocument,
  validateHireContractFields,
} from "@/lib/personas-lifecycle";

describe("isAllowedLifecycleTransition", () => {
  it("bloquea contratado → inactivo sin anulación", () => {
    expect(isAllowedLifecycleTransition("contratado", "inactivo")).toBe(false);
    expect(isAllowedLifecycleTransition("contratado", "inactivo", { reason: "renuncia" })).toBe(false);
  });

  it("permite contratado → inactivo solo con contratacion_anulada", () => {
    expect(
      isAllowedLifecycleTransition("contratado", "inactivo", { reason: CANCEL_HIRE_REASON }),
    ).toBe(true);
  });

  it("sigue permitiendo transiciones previas al alta", () => {
    expect(isAllowedLifecycleTransition("seleccionado", "contratado")).toBe(true);
    expect(isAllowedLifecycleTransition("seleccionado", "inactivo")).toBe(true);
    expect(isAllowedLifecycleTransition("postulante", "te")).toBe(true);
  });
});

describe("canCancelHireFromCounts", () => {
  it("es elegible si está contratado y no hay trabajo registrado", () => {
    expect(
      canCancelHireFromCounts({ lifecycleStatus: "contratado", marcaciones: 0, liquidaciones: 0 }),
    ).toEqual({ eligible: true, reason: null, code: null });
  });

  it("rechaza si hay marcaciones o liquidaciones", () => {
    expect(
      canCancelHireFromCounts({ lifecycleStatus: "contratado", marcaciones: 1, liquidaciones: 0 }).eligible,
    ).toBe(false);
    expect(
      canCancelHireFromCounts({ lifecycleStatus: "contratado", marcaciones: 0, liquidaciones: 2 }).code,
    ).toBe("has_work");
  });

  it("rechaza si hay contrato laboral firmado aunque no haya trabajado", () => {
    const result = canCancelHireFromCounts({
      lifecycleStatus: "contratado",
      marcaciones: 0,
      liquidaciones: 0,
      signedLaborContracts: 1,
    });
    expect(result.eligible).toBe(false);
    expect(result.code).toBe("signed_contract");
    expect(result.reason).toMatch(/contrato laboral firmado/i);
  });

  it("rechaza otros estados", () => {
    expect(
      canCancelHireFromCounts({ lifecycleStatus: "seleccionado", marcaciones: 0, liquidaciones: 0 }).code,
    ).toBe("not_contratado");
  });
});

describe("isSignedLaborContractDocument", () => {
  it("solo cuenta contrato_laboral firmado", () => {
    expect(
      isSignedLaborContractDocument({
        category: "contrato_laboral",
        signatureStatus: "completed",
        signedAt: null,
      }),
    ).toBe(true);
    expect(
      isSignedLaborContractDocument({
        category: "contrato_laboral",
        signatureStatus: "external",
        signedAt: null,
      }),
    ).toBe(true);
    expect(
      isSignedLaborContractDocument({
        category: "contrato_laboral",
        signatureStatus: "pending",
        signedAt: "2026-08-01",
      }),
    ).toBe(true);
    expect(
      isSignedLaborContractDocument({
        category: "contrato_laboral",
        signatureStatus: "pending",
        signedAt: null,
      }),
    ).toBe(false);
    expect(
      isSignedLaborContractDocument({
        category: "anexo_contrato",
        signatureStatus: "completed",
        signedAt: null,
      }),
    ).toBe(false);
  });
});

describe("isCancelledHireRecord", () => {
  it("reconoce anulación vs finiquito", () => {
    expect(isCancelledHireRecord({ terminationReason: CANCEL_HIRE_REASON })).toBe(true);
    expect(isCancelledHireRecord({ terminationReason: "Finiquito" })).toBe(false);
    expect(isCancelledHireRecord({ terminationReason: null })).toBe(false);
  });
});

describe("validateHireContractFields", () => {
  it("exige fecha de inicio", () => {
    expect(
      validateHireContractFields({
        contractType: "indefinido",
        startDate: "",
        period1End: "",
        period2End: "",
      }),
    ).toMatch(/inicio/);
  });

  it("exige 1er plazo en plazo fijo y valida orden", () => {
    expect(
      validateHireContractFields({
        contractType: "plazo_fijo",
        startDate: "2026-08-01",
        period1End: "",
        period2End: "",
      }),
    ).toMatch(/1er plazo/);
    expect(
      validateHireContractFields({
        contractType: "plazo_fijo",
        startDate: "2026-08-01",
        period1End: "2026-07-01",
        period2End: "",
      }),
    ).toMatch(/anterior/);
    expect(
      validateHireContractFields({
        contractType: "plazo_fijo",
        startDate: "2026-08-01",
        period1End: "2026-12-01",
        period2End: "2026-10-01",
      }),
    ).toMatch(/2do plazo/);
    expect(
      validateHireContractFields({
        contractType: "plazo_fijo",
        startDate: "2026-08-01",
        period1End: "2026-12-01",
        period2End: "2027-06-01",
      }),
    ).toBeNull();
  });
});

describe("computeFiniquitoSettlement", () => {
  it("resta AFC y no baja de 0", () => {
    expect(
      computeFiniquitoSettlement({
        vacationPaymentAmount: 445256,
        pendingRemunerationAmount: 283329,
        yearsOfServiceAmount: 739750,
        substituteNoticeAmount: 0,
        afcDeductionAmount: 165478,
      }),
    ).toBe(1302857);
    expect(
      computeFiniquitoSettlement({
        vacationPaymentAmount: 100,
        afcDeductionAmount: 500,
      }),
    ).toBe(0);
  });
});

describe("isClosingInstallationStatus", () => {
  it("detecta cierre desde active", () => {
    expect(isClosingInstallationStatus("active", "inactive")).toBe(true);
    expect(isClosingInstallationStatus("active", "prospect")).toBe(true);
    expect(isClosingInstallationStatus("active", "active")).toBe(false);
    expect(isClosingInstallationStatus("inactive", "inactive")).toBe(false);
  });
});
