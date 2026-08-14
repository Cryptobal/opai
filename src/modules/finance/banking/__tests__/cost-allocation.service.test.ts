import { describe, it, expect, vi, beforeEach } from "vitest";
import { assignmentFromAllocations, splitAmountByWeights } from "../cost-allocation-math";

const prismaMock = vi.hoisted(() => ({
  opsAsignacionGuardia: { findMany: vi.fn() },
  opsPuestoOperativo: { findMany: vi.fn() },
  crmInstallation: { findMany: vi.fn() },
  financeCostCenter: { findMany: vi.fn(), create: vi.fn() },
}));

vi.mock("@/lib/prisma", () => ({ prisma: prismaMock }));

vi.mock("../rut-recognition.service", () => ({
  recognizeRutsForTransactions: vi.fn(),
}));

import { computeAllocationWeights } from "../cost-allocation.service";

describe("splitAmountByWeights", () => {
  it("división exacta", () => {
    const out = splitAmountByWeights(90_000, [
      { installationId: "a", weight: 1 },
      { installationId: "b", weight: 1 },
      { installationId: "c", weight: 1 },
    ]);
    expect(out.map((r) => r.amount).reduce((s, n) => s + n, 0)).toBe(90_000);
    expect(out.every((r) => r.amount === 30_000)).toBe(true);
  });

  it("división con resto: $100.000 entre 3 → 33334 / 33333 / 33333", () => {
    const out = splitAmountByWeights(100_000, [
      { installationId: "aaa", weight: 1 },
      { installationId: "bbb", weight: 1 },
      { installationId: "ccc", weight: 1 },
    ]);
    const amounts = out.map((r) => r.amount).sort((a, b) => b - a);
    expect(amounts).toEqual([33_334, 33_333, 33_333]);
    expect(amounts.reduce((s, n) => s + n, 0)).toBe(100_000);
  });

  it("monto 1 peso va a la de mayor peso", () => {
    const out = splitAmountByWeights(1, [
      { installationId: "low", weight: 1 },
      { installationId: "high", weight: 9 },
    ]);
    expect(out).toEqual([{ installationId: "high", amount: 1 }]);
  });

  it("200 instalaciones suman el monto original", () => {
    const weights = Array.from({ length: 200 }, (_, i) => ({
      installationId: `i${String(i).padStart(3, "0")}`,
      weight: 1,
    }));
    const out = splitAmountByWeights(1_000_000, weights);
    expect(out.reduce((s, r) => s + r.amount, 0)).toBe(1_000_000);
    expect(out.length).toBe(200);
  });

  it("pesos muy desiguales: residuo cae en la de mayor peso", () => {
    const out = splitAmountByWeights(100, [
      { installationId: "tiny", weight: 1 },
      { installationId: "huge", weight: 99 },
    ]);
    expect(out.reduce((s, r) => s + r.amount, 0)).toBe(100);
    const huge = out.find((r) => r.installationId === "huge")!;
    expect(huge.amount).toBe(99);
  });

  it("empate de pesos: residuo determinista por installationId ascendente", () => {
    const out = splitAmountByWeights(100_000, [
      { installationId: "z-last", weight: 1 },
      { installationId: "a-first", weight: 1 },
      { installationId: "m-mid", weight: 1 },
    ]);
    const extra = out.find((r) => r.amount === 33_334);
    expect(extra?.installationId).toBe("a-first");
  });

  it("no crea filas en 0 ($5 entre 10)", () => {
    const weights = Array.from({ length: 10 }, (_, i) => ({
      installationId: `x${i}`,
      weight: 1,
    }));
    const out = splitAmountByWeights(5, weights);
    expect(out.length).toBe(5);
    expect(out.every((r) => r.amount === 1)).toBe(true);
    expect(out.reduce((s, r) => s + r.amount, 0)).toBe(5);
  });
});

describe("assignmentFromAllocations", () => {
  it("NONE si no hay filas; SINGLE si hay una; SPLIT si hay varias", () => {
    expect(assignmentFromAllocations([])).toEqual({ mode: "NONE" });
    expect(
      assignmentFromAllocations([
        { installationId: "i1", amount: 10, driver: "EQUAL" },
      ]),
    ).toEqual({ mode: "SINGLE", installationId: "i1" });
    expect(
      assignmentFromAllocations([
        { installationId: "i1", amount: 50, driver: "MANUAL" },
        { installationId: "i2", amount: 50, driver: "MANUAL" },
      ]),
    ).toEqual({
      mode: "SPLIT",
      driver: "MANUAL",
      installations: [
        { installationId: "i1", amount: 50 },
        { installationId: "i2", amount: 50 },
      ],
    });
  });
});

describe("computeAllocationWeights", () => {
  const TENANT = "t1";
  const REF = new Date("2026-08-14T00:00:00.000Z");

  beforeEach(() => {
    vi.clearAllMocks();
    prismaMock.opsAsignacionGuardia.findMany.mockResolvedValue([]);
    prismaMock.opsPuestoOperativo.findMany.mockResolvedValue([]);
  });

  it("EQUAL ignora dotación", async () => {
    const result = await computeAllocationWeights({
      tenantId: TENANT,
      installationIds: ["i1", "i2"],
      driver: "EQUAL",
      refDate: REF,
    });
    expect(result.weights).toEqual([
      { installationId: "i1", weight: 1, driverValue: null },
      { installationId: "i2", weight: 1, driverValue: null },
    ]);
    expect(result.excluded).toEqual([]);
    expect(prismaMock.opsAsignacionGuardia.findMany).not.toHaveBeenCalled();
  });

  it("ACTIVE_GUARDS usa fallback requiredGuards cuando da 0 y excluye si ambos dan 0", async () => {
    prismaMock.opsAsignacionGuardia.findMany.mockResolvedValue([
      { installationId: "i-active", guardiaId: "g1" },
      { installationId: "i-active", guardiaId: "g2" },
    ]);
    prismaMock.opsPuestoOperativo.findMany.mockResolvedValue([
      { installationId: "i-fallback", requiredGuards: 4 },
      { installationId: "i-zero", requiredGuards: 0 },
    ]);

    const result = await computeAllocationWeights({
      tenantId: TENANT,
      installationIds: ["i-active", "i-fallback", "i-zero"],
      driver: "ACTIVE_GUARDS",
      refDate: REF,
    });

    expect(result.weights).toEqual([
      { installationId: "i-active", weight: 2, driverValue: 2 },
      { installationId: "i-fallback", weight: 4, driverValue: 4 },
    ]);
    expect(result.excluded).toEqual(["i-zero"]);
  });
});

describe("assertInstallationsBelongToTenant", () => {
  it("rechaza si falta alguna instalación del tenant", async () => {
    const { assertInstallationsBelongToTenant } = await import(
      "../cost-allocation.service"
    );
    prismaMock.crmInstallation.findMany.mockResolvedValue([{ id: "i1" }]);
    await expect(
      assertInstallationsBelongToTenant("t1", ["i1", "i-foreign"]),
    ).rejects.toThrow(/no pertenecen/i);
  });
});
