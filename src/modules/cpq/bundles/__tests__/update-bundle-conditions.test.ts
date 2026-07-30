/**
 * Tests de updateBundle sobre las condiciones a nivel propuesta: rangos
 * válidos, rechazo de valores que romperían el motor al propagarse a TODAS las
 * hijas (contractDuration = 0 divide por cero) y limpieza de reajuste NONE.
 */
import { describe, it, expect, vi, beforeEach } from "vitest";

const mocks = vi.hoisted(() => ({
  findFirst: vi.fn(),
  update: vi.fn(),
}));

vi.mock("@/lib/prisma", () => ({
  prisma: {
    cpqProposalBundle: { findFirst: mocks.findFirst, update: mocks.update },
  },
}));

import { updateBundle } from "../bundle.service";

const call = (data: Record<string, unknown>) =>
  updateBundle({ tenantId: "t1", bundleId: "b1", data });

const lastData = () => mocks.update.mock.calls.at(-1)![0].data;

beforeEach(() => {
  vi.clearAllMocks();
  mocks.findFirst.mockResolvedValue({ id: "b1" });
  mocks.update.mockResolvedValue({ id: "b1" });
});

describe("updateBundle — condiciones de la propuesta", () => {
  it("verifica pertenencia al tenant antes de escribir", async () => {
    mocks.findFirst.mockResolvedValue(null);
    await expect(call({ paymentTerms: "30_dias" })).rejects.toThrow(
      "Propuesta no encontrada",
    );
    expect(mocks.update).not.toHaveBeenCalled();
    expect(mocks.findFirst).toHaveBeenCalledWith(
      expect.objectContaining({ where: { id: "b1", tenantId: "t1" } }),
    );
  });

  it("rechaza contractDuration = 0 (dividiría por cero en el prorrateo)", async () => {
    await expect(call({ contractDuration: 0 })).rejects.toThrow(
      /Duración del contrato debe estar entre 1 y 60/,
    );
    expect(mocks.update).not.toHaveBeenCalled();
  });

  it("rechaza valores fuera de rango del resto de condiciones", async () => {
    await expect(call({ serviceStartDays: 0 })).rejects.toThrow(/Inicio de servicios/);
    await expect(call({ paymentDays: 45 })).rejects.toThrow(/Días de pago/);
    await expect(call({ liabilityMonths: 99 })).rejects.toThrow(/Límite de responsabilidad/);
    await expect(call({ realAnnualIncrement: -1 })).rejects.toThrow(/Incremento real anual/);
    await expect(call({ ipcWeight: 150 })).rejects.toThrow(/% IPC/);
    await expect(call({ insurancePolicyUF: -5 })).rejects.toThrow(/no puede ser negativo/);
    await expect(call({ financialRatePct: 120 })).rejects.toThrow(/entre 0 y 100/);
    await expect(call({ paymentTerms: "a_convenir" })).rejects.toThrow(/Forma de pago inválida/);
    expect(mocks.update).not.toHaveBeenCalled();
  });

  it("acepta valores válidos en los bordes del rango", async () => {
    await call({ contractDuration: 1, paymentDays: 30, realAnnualIncrement: 0 });
    expect(lastData()).toMatchObject({
      contractDuration: 1,
      paymentDays: 30,
      realAnnualIncrement: 0,
    });
  });

  it("reajuste NONE limpia frecuencia y pesos del polinomio", async () => {
    await call({ adjustmentType: "NONE", adjustmentFreq: "ANUAL", ipcWeight: 60 });
    expect(lastData()).toMatchObject({
      adjustmentType: "NONE",
      adjustmentFreq: null,
      ipcWeight: null,
      imoWeight: null,
    });
  });

  it("null des-gobierna el campo (vuelve a mandar la cotización)", async () => {
    await call({ paymentTerms: null, contractDuration: null, financialRatePct: null });
    expect(lastData()).toMatchObject({
      paymentTerms: null,
      contractDuration: null,
      financialRatePct: null,
    });
  });

  it("no toca campos ausentes del payload", async () => {
    await call({ paymentTerms: "anticipado" });
    const data = lastData();
    expect(data).toEqual({ paymentTerms: "anticipado" });
  });
});
