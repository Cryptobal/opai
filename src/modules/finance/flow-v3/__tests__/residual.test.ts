import { describe, it, expect } from "vitest";
import { computeCellExecution } from "../residual";

const base = {
  settlement: "AUTO" as const,
  residualCarryEnabled: true,
  residualMinClp: 10_000,
};

describe("computeCellExecution", () => {
  it("parcial (Retiro socios): 10 M proyectado, 2,2 M real → residual 7,8 M", () => {
    const { execution, residual, committedNetCash } = computeCellExecution({
      ...base,
      section: "FINANCIAMIENTO",
      plan: -10_000_000,
      committedTotal: 0,
      committedNet: 0,
      invoiced: false,
      realSigned: -2_200_000,
    });
    expect(committedNetCash).toBe(0);
    expect(residual).toBe(-7_800_000);
    expect(execution).toMatchObject({
      projected: 10_000_000,
      real: 2_200_000,
      residual: -7_800_000,
      over: 0,
      state: "partial",
    });
    expect(execution.pct).toBeCloseTo(22, 5);
    // effective = real + net + residual
    expect(-2_200_000 + committedNetCash + residual).toBe(-10_000_000);
  });

  it("excedido: real 12 M sobre proyectado 10 M → residual 0, over 2 M", () => {
    const { execution, residual } = computeCellExecution({
      ...base,
      section: "FINANCIAMIENTO",
      plan: -10_000_000,
      committedTotal: 0,
      committedNet: 0,
      invoiced: false,
      realSigned: -12_000_000,
    });
    expect(residual).toBe(0);
    expect(execution).toMatchObject({
      projected: 10_000_000,
      real: 12_000_000,
      residual: 0,
      over: 2_000_000,
      state: "over",
    });
    expect(execution.pct).toBeCloseTo(120, 5);
  });

  it("exacto: 72 M = 72 M → complete, sin residual", () => {
    const { execution, residual } = computeCellExecution({
      ...base,
      section: "PERSONAL",
      plan: 72_000_000,
      committedTotal: 0,
      committedNet: 0,
      invoiced: false,
      realSigned: -72_000_000,
    });
    expect(residual).toBe(0);
    expect(execution).toMatchObject({
      projected: 72_000_000,
      real: 72_000_000,
      residual: 0,
      over: 0,
      state: "complete",
      pct: 100,
    });
  });

  it("dado por cumplido (CLOSED): residual 0, state closed, proyección conservada", () => {
    const { execution, residual } = computeCellExecution({
      ...base,
      settlement: "CLOSED",
      section: "FINANCIAMIENTO",
      plan: -10_000_000,
      committedTotal: 0,
      committedNet: 0,
      invoiced: false,
      realSigned: -2_200_000,
    });
    expect(residual).toBe(0);
    expect(execution).toMatchObject({
      projected: 10_000_000,
      real: 2_200_000,
      residual: 0,
      state: "closed",
      settlement: "CLOSED",
    });
  });

  it("factura parcial (familia B): committedNet + real sin doble conteo", () => {
    // F° 9.511.641 con abono 4.000.000 → pendingClp = 5.511.641 en items dte
    const pending = 5_511_641;
    const paid = 4_000_000;
    const { execution, residual, committedNetCash } = computeCellExecution({
      ...base,
      section: "INGRESOS",
      plan: 0,
      committedTotal: pending,
      committedNet: pending,
      invoiced: true,
      realSigned: paid,
    });
    expect(residual).toBe(0); // committedGross = 0
    expect(committedNetCash).toBe(pending);
    expect(paid + committedNetCash + residual).toBe(9_511_641);
    expect(execution.state).toBe("none"); // projected bruto = 0
    expect(execution.pct).toBeNull();
  });

  it("bajo tolerancia: residual 5.000 ≤ 10.000 → 0", () => {
    const { execution, residual } = computeCellExecution({
      ...base,
      section: "GAV",
      plan: 500_000,
      committedTotal: 0,
      committedNet: 0,
      invoiced: false,
      realSigned: -495_000,
    });
    expect(residual).toBe(0);
    expect(execution.state).toBe("complete");
  });

  it("signo mixto: proyecté egreso, entró abono → residual = proyectado completo", () => {
    const { residual, execution } = computeCellExecution({
      ...base,
      section: "FINANCIAMIENTO",
      plan: -10_000_000,
      committedTotal: 0,
      committedNet: 0,
      invoiced: false,
      realSigned: 500_000, // abono inesperado
    });
    // executed = 500_000 * (-1) = -500_000 → max(0, 10M - (-500k)) = 10.5M
    // clampeado a |proj| = 10M
    expect(residual).toBe(-10_000_000);
    expect(Math.abs(residual)).toBe(execution.projected);
  });

  it("projected === 0 con real ≠ 0 → residual 0, state none", () => {
    const { execution, residual } = computeCellExecution({
      ...base,
      section: "GAV",
      plan: 0,
      committedTotal: 0,
      committedNet: 0,
      invoiced: false,
      realSigned: -100_000,
    });
    expect(residual).toBe(0);
    expect(execution).toMatchObject({
      projected: 0,
      residual: 0,
      pct: null,
      state: "none",
    });
  });

  it("residualCarryEnabled=false + real → sólo real (legado)", () => {
    const { residual, committedNetCash } = computeCellExecution({
      ...base,
      residualCarryEnabled: false,
      section: "FINANCIAMIENTO",
      plan: -10_000_000,
      committedTotal: 0,
      committedNet: 0,
      invoiced: false,
      realSigned: -2_200_000,
    });
    expect(residual).toBe(0);
    expect(committedNetCash).toBe(0);
  });

  it("residualCarryEnabled=false sin real → residual = proyección (plan)", () => {
    const { residual, committedNetCash } = computeCellExecution({
      ...base,
      residualCarryEnabled: false,
      section: "GAV",
      plan: 400_000,
      committedTotal: 0,
      committedNet: 0,
      invoiced: false,
      realSigned: 0,
    });
    expect(residual).toBe(-400_000);
    expect(committedNetCash).toBe(0);
  });

  it("INGRESOS con plan: residual cash-signed positivo", () => {
    const { residual, execution } = computeCellExecution({
      ...base,
      section: "INGRESOS",
      plan: 1_000_000,
      committedTotal: 0,
      committedNet: 0,
      invoiced: false,
      realSigned: 300_000,
    });
    expect(residual).toBe(700_000);
    expect(execution.state).toBe("partial");
    expect(execution.pct).toBeCloseTo(30, 5);
  });

  it("egreso vía committed (sin plan): sign −", () => {
    const { residual, committedNetCash } = computeCellExecution({
      ...base,
      section: "GAV",
      plan: 0,
      committedTotal: 1_000_000,
      committedNet: 0,
      invoiced: false,
      realSigned: -200_000,
    });
    expect(committedNetCash).toBe(0);
    expect(residual).toBe(-800_000);
  });

  it("FINANCIAMIENTO plan negativo (retiro) parcial", () => {
    const { residual } = computeCellExecution({
      ...base,
      section: "FINANCIAMIENTO",
      plan: -5_000_000,
      committedTotal: 0,
      committedNet: 0,
      invoiced: false,
      realSigned: -1_000_000,
    });
    expect(residual).toBe(-4_000_000);
  });

  it("RETIRO_SOCIO: plan +10M tipado se trata como egreso −10M", () => {
    const { residual } = computeCellExecution({
      ...base,
      section: "FINANCIAMIENTO",
      canonicalKey: "RETIRO_SOCIO",
      plan: 10_000_000,
      committedTotal: 0,
      committedNet: 0,
      invoiced: false,
      realSigned: 0,
    });
    expect(residual).toBe(-10_000_000);
  });

  it("sin real ⇒ execution.state none (proyección viva no es 'ejecución')", () => {
    const { execution, residual } = computeCellExecution({
      ...base,
      section: "GAV",
      plan: 100_000,
      committedTotal: 0,
      committedNet: 0,
      invoiced: false,
      realSigned: 0,
    });
    expect(residual).toBe(-100_000);
    expect(execution.state).toBe("none");
  });

  it("realSigned===0 + committed: effective = committedCash (invariante)", () => {
    const { residual, committedNetCash } = computeCellExecution({
      ...base,
      section: "INGRESOS",
      plan: 0,
      committedTotal: 900_000,
      committedNet: 400_000,
      invoiced: true,
      realSigned: 0,
    });
    // net 400k + gross 500k = 900k
    expect(committedNetCash + residual).toBe(900_000);
  });
});
