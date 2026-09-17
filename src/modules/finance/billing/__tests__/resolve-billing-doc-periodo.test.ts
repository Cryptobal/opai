/**
 * Tests del rótulo de período de Proforma / Estado de Pago.
 * Cubre el bug: EP con programación + selector CURRENT debe decir
 * el mes de emisión, no periodPolicy de la plantilla.
 */

import { describe, it, expect } from "vitest";
import {
  resolveBillingDocPeriodo,
  estadoPagoPeriodoModeFromPolicy,
} from "../resolve-billing-doc-periodo";

const augustIssue = new Date(Date.UTC(2026, 7, 28)); // 28 ago 2026
const januaryIssue = new Date(Date.UTC(2026, 0, 5));

const recurringPrevious = {
  billingPeriod: "2026-08",
  periodPolicy: "PREVIOUS_MONTH" as const,
};

describe("resolveBillingDocPeriodo — Estado de Pago", () => {
  it("CURRENT + programación PREVIOUS_MONTH → mes de emisión (agosto)", () => {
    const r = resolveBillingDocPeriodo({
      variant: "ESTADO_DE_PAGO",
      issueDate: augustIssue,
      estadoPagoPeriodoMode: "CURRENT",
      recurring: recurringPrevious,
    });
    expect(r.periodoLabel).toBe("Agosto 2026");
    expect(r.periodoDate.getUTCMonth()).toBe(7);
    expect(r.periodoDate.getUTCFullYear()).toBe(2026);
  });

  it("PREVIOUS + programación CURRENT_MONTH → mes anterior (julio)", () => {
    const r = resolveBillingDocPeriodo({
      variant: "ESTADO_DE_PAGO",
      issueDate: augustIssue,
      estadoPagoPeriodoMode: "PREVIOUS",
      recurring: {
        billingPeriod: "2026-08",
        periodPolicy: "CURRENT_MONTH",
      },
    });
    expect(r.periodoLabel).toBe("Julio 2026");
    expect(r.periodoDate.getUTCMonth()).toBe(6);
  });

  it("PREVIOUS en enero hace wrap a diciembre del año anterior", () => {
    const r = resolveBillingDocPeriodo({
      variant: "ESTADO_DE_PAGO",
      issueDate: januaryIssue,
      estadoPagoPeriodoMode: "PREVIOUS",
    });
    expect(r.periodoLabel).toBe("Diciembre 2025");
  });

  it("sin modo (null) trata como CURRENT", () => {
    const r = resolveBillingDocPeriodo({
      variant: "ESTADO_DE_PAGO",
      issueDate: augustIssue,
      estadoPagoPeriodoMode: null,
    });
    expect(r.periodoLabel).toBe("Agosto 2026");
  });
});

describe("resolveBillingDocPeriodo — Proforma", () => {
  it("programada PREVIOUS_MONTH anclada a agosto → julio", () => {
    const r = resolveBillingDocPeriodo({
      variant: "PROFORMA",
      issueDate: augustIssue,
      estadoPagoPeriodoMode: "CURRENT",
      recurring: recurringPrevious,
    });
    expect(r.periodoLabel).toBe("Julio 2026");
  });

  it("programada CURRENT_MONTH anclada a agosto → agosto", () => {
    const r = resolveBillingDocPeriodo({
      variant: "PROFORMA",
      issueDate: augustIssue,
      estadoPagoPeriodoMode: "PREVIOUS",
      recurring: {
        billingPeriod: "2026-08",
        periodPolicy: "CURRENT_MONTH",
      },
    });
    expect(r.periodoLabel).toBe("Agosto 2026");
  });

  it("sin programación usa el mes de emisión", () => {
    const r = resolveBillingDocPeriodo({
      variant: "PROFORMA",
      issueDate: augustIssue,
      estadoPagoPeriodoMode: "PREVIOUS",
    });
    expect(r.periodoLabel).toBe("Agosto 2026");
  });

  it("billingPeriod inválido cae al mes de emisión", () => {
    const r = resolveBillingDocPeriodo({
      variant: "PROFORMA",
      issueDate: augustIssue,
      recurring: { billingPeriod: "agosto", periodPolicy: "PREVIOUS_MONTH" },
    });
    expect(r.periodoLabel).toBe("Agosto 2026");
  });
});

describe("estadoPagoPeriodoModeFromPolicy", () => {
  it("PREVIOUS_MONTH → PREVIOUS", () => {
    expect(estadoPagoPeriodoModeFromPolicy("PREVIOUS_MONTH")).toBe("PREVIOUS");
  });

  it("CURRENT_MONTH y NEXT_MONTH → CURRENT", () => {
    expect(estadoPagoPeriodoModeFromPolicy("CURRENT_MONTH")).toBe("CURRENT");
    expect(estadoPagoPeriodoModeFromPolicy("NEXT_MONTH")).toBe("CURRENT");
  });

  it("null / desconocido → CURRENT", () => {
    expect(estadoPagoPeriodoModeFromPolicy(null)).toBe("CURRENT");
    expect(estadoPagoPeriodoModeFromPolicy("OTRO")).toBe("CURRENT");
  });
});
