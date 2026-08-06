import { describe, it, expect, vi, beforeEach } from "vitest";

vi.mock("server-only", () => ({}));
vi.mock("@/lib/prisma", () => ({
  prisma: {
    crmAccount: { findMany: vi.fn() },
    financeFactoringCompany: { findMany: vi.fn() },
    financeSupplier: { findMany: vi.fn() },
    opsGuardia: { findMany: vi.fn() },
    crmInstallation: { findMany: vi.fn() },
  },
}));

import { prisma } from "@/lib/prisma";
import { recognizeRutsForTransactions } from "../rut-recognition.service";

const TENANT = "t1";
const asMock = (fn: unknown) => fn as ReturnType<typeof vi.fn>;

beforeEach(() => {
  vi.clearAllMocks();
  asMock(prisma.crmAccount.findMany).mockResolvedValue([]);
  asMock(prisma.financeFactoringCompany.findMany).mockResolvedValue([]);
  asMock(prisma.financeSupplier.findMany).mockResolvedValue([]);
  asMock(prisma.opsGuardia.findMany).mockResolvedValue([]);
  asMock(prisma.crmInstallation.findMany).mockResolvedValue([]);
});

describe("recognizeRutsForTransactions — identidad enriquecida", () => {
  it("sin RUT en glosa → unknown vacío", async () => {
    const map = await recognizeRutsForTransactions(TENANT, [
      { id: "tx1", description: "Sin nada", reference: null },
    ]);
    expect(map.get("tx1")).toMatchObject({
      rut: null,
      kind: "unknown",
      entityId: null,
      alsoRegisteredAs: [],
      guardiaState: null,
    });
    expect(prisma.opsGuardia.findMany).not.toHaveBeenCalled();
  });

  it("guardia con puesto: guardiaState + installationName", async () => {
    asMock(prisma.opsGuardia.findMany).mockResolvedValue([
      {
        id: "g1",
        status: "active",
        lifecycleStatus: "contratado",
        terminatedAt: null,
        currentInstallationId: "inst-1",
        availableExtraShifts: true,
        persona: {
          rut: "25.660.978-9",
          firstName: "Franklys",
          lastName: "Perez",
        },
      },
    ]);
    asMock(prisma.crmInstallation.findMany).mockResolvedValue([
      { id: "inst-1", name: "Polpaico — Coronel" },
    ]);

    const map = await recognizeRutsForTransactions(TENANT, [
      {
        id: "tx1",
        description: "Transf a 25.660.978-9 Franklys",
        reference: null,
      },
    ]);

    const rec = map.get("tx1");
    expect(rec?.kind).toBe("guardia");
    expect(rec?.entityId).toBe("g1");
    expect(rec?.entityName).toBe("Franklys Perez");
    expect(rec?.guardiaState).toEqual({
      status: "active",
      lifecycleStatus: "contratado",
      terminatedAt: null,
      installationName: "Polpaico — Coronel",
      availableExtraShifts: true,
    });
    expect(rec?.alsoRegisteredAs).toEqual(["guardia"]);
    expect(prisma.crmInstallation.findMany).toHaveBeenCalledWith(
      expect.objectContaining({
        where: expect.objectContaining({
          tenantId: TENANT,
          id: { in: ["inst-1"] },
        }),
      }),
    );
  });

  it("alsoRegisteredAs incluye todos los ocupantes (conflicto)", async () => {
    asMock(prisma.crmAccount.findMany).mockResolvedValue([
      { id: "acc1", name: "Socio SA", rut: "256609789" },
    ]);
    asMock(prisma.opsGuardia.findMany).mockResolvedValue([
      {
        id: "g1",
        status: "active",
        lifecycleStatus: "contratado",
        terminatedAt: null,
        currentInstallationId: null,
        availableExtraShifts: false,
        persona: {
          rut: "256609789",
          firstName: "Franklys",
          lastName: "Perez",
        },
      },
    ]);

    const map = await recognizeRutsForTransactions(TENANT, [
      {
        id: "tx1",
        description: "Pago 25.660.978-9",
        reference: null,
      },
    ]);

    // Prioridad: client gana
    expect(map.get("tx1")?.kind).toBe("client");
    expect(map.get("tx1")?.alsoRegisteredAs).toEqual(
      expect.arrayContaining(["client", "guardia"]),
    );
    expect(map.get("tx1")?.alsoRegisteredAs).toHaveLength(2);
    // Sin installationId → no query de instalaciones
    expect(prisma.crmInstallation.findMany).not.toHaveBeenCalled();
  });

  it("finiquitado: terminatedAt en ISO date", async () => {
    asMock(prisma.opsGuardia.findMany).mockResolvedValue([
      {
        id: "g2",
        status: "inactive",
        lifecycleStatus: "inactivo",
        terminatedAt: new Date("2026-07-31T00:00:00.000Z"),
        currentInstallationId: null,
        availableExtraShifts: false,
        persona: {
          rut: "123456785",
          firstName: "Ana",
          lastName: "Diaz",
        },
      },
    ]);

    const map = await recognizeRutsForTransactions(TENANT, [
      {
        id: "tx2",
        description: "12.345.678-5 transfer",
        reference: null,
      },
    ]);

    expect(map.get("tx2")?.kind).toBe("guardia");
    expect(map.get("tx2")?.guardiaState?.terminatedAt).toBe("2026-07-31");
    expect(map.get("tx2")?.guardiaState?.installationName).toBeNull();
  });

  it("queries siempre filtran por tenantId", async () => {
    asMock(prisma.opsGuardia.findMany).mockResolvedValue([]);
    await recognizeRutsForTransactions(TENANT, [
      { id: "tx1", description: "25.660.978-9", reference: null },
    ]);
    for (const model of [
      prisma.crmAccount,
      prisma.financeFactoringCompany,
      prisma.financeSupplier,
      prisma.opsGuardia,
    ] as const) {
      expect(asMock(model.findMany)).toHaveBeenCalledWith(
        expect.objectContaining({
          where: expect.objectContaining({ tenantId: TENANT }),
        }),
      );
    }
  });
});
