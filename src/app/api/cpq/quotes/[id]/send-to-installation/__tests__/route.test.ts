// @vitest-environment node
import { beforeEach, describe, expect, it, vi } from "vitest";
import { NextRequest } from "next/server";

const mocks = vi.hoisted(() => ({
  requireAuth: vi.fn(),
  requireCpqEdit: vi.fn(),
  requireTenantModule: vi.fn(),
  createOpsAuditLog: vi.fn(),
  createPuestoSalaryStructure: vi.fn(),
  loadInstallationServiceWindow: vi.fn(),
  syncPayrollItemForInstallation: vi.fn(),
  quoteFindFirst: vi.fn(),
  installationFindFirst: vi.fn(),
  puestoFindMany: vi.fn(),
  pautaFindMany: vi.fn(),
  asistenciaFindMany: vi.fn(),
  asignacionFindMany: vi.fn(),
  marcacionFindMany: vi.fn(),
  turnoExtraFindMany: vi.fn(),
  serieFindMany: vi.fn(),
  txPuestoUpdateMany: vi.fn(),
  txPuestoDeleteMany: vi.fn(),
  txPuestoCreate: vi.fn(),
  txInstallationUpdate: vi.fn(),
}));

vi.mock("@/lib/api-auth", async () => {
  const { NextResponse: NR } = await import("next/server");
  return {
    requireAuth: mocks.requireAuth,
    unauthorized: () => NR.json({ success: false, error: "No autorizado" }, { status: 401 }),
  };
});

vi.mock("@/lib/api-auth-cpq", () => ({
  requireCpqEdit: mocks.requireCpqEdit,
}));

vi.mock("@/lib/require-module", () => ({
  requireTenantModule: mocks.requireTenantModule,
}));

vi.mock("@/lib/ops", () => ({
  createOpsAuditLog: mocks.createOpsAuditLog,
}));

vi.mock("@/lib/ops/puesto-salary-structure", () => ({
  createPuestoSalaryStructure: mocks.createPuestoSalaryStructure,
}));

vi.mock("@/modules/finance/flow-v3/load-installation-windows", () => ({
  loadInstallationServiceWindow: mocks.loadInstallationServiceWindow,
}));

vi.mock("@/modules/finance/cashflow/generators/payroll-sync", () => ({
  syncPayrollItemForInstallation: mocks.syncPayrollItemForInstallation,
}));

const tx = {
  opsPuestoOperativo: {
    updateMany: mocks.txPuestoUpdateMany,
    deleteMany: mocks.txPuestoDeleteMany,
    create: mocks.txPuestoCreate,
  },
  crmInstallation: { update: mocks.txInstallationUpdate },
};

vi.mock("@/lib/prisma", () => ({
  prisma: {
    cpqQuote: { findFirst: mocks.quoteFindFirst },
    crmInstallation: { findFirst: mocks.installationFindFirst },
    opsPuestoOperativo: { findMany: mocks.puestoFindMany },
    opsPautaMensual: { findMany: mocks.pautaFindMany },
    opsAsistenciaDiaria: { findMany: mocks.asistenciaFindMany },
    opsAsignacionGuardia: { findMany: mocks.asignacionFindMany },
    opsMarcacion: { findMany: mocks.marcacionFindMany },
    opsTurnoExtra: { findMany: mocks.turnoExtraFindMany },
    opsSerieAsignacion: { findMany: mocks.serieFindMany },
    $transaction: (fn: (t: typeof tx) => Promise<unknown>) => fn(tx),
  },
}));

const { POST } = await import("../route");

const CTX = {
  userId: "u-1",
  tenantId: "tenant-a",
  userEmail: "ops@gard.cl",
  userRole: "admin",
  roleTemplateId: null,
};

const QUOTE_ID = "11111111-1111-4111-8111-111111111111";
const INSTALLATION_ID = "22222222-2222-4222-8222-222222222222";

function position(over: Record<string, unknown> = {}) {
  return {
    id: "pos-1",
    puestoTrabajoId: "pt-1",
    customName: null,
    cargoId: "cargo-1",
    rolId: "rol-1",
    startTime: "08:00",
    endTime: "20:00",
    weekdays: ["Lun", "Mar", "Mié", "Jue", "Vie"],
    numGuards: 2,
    numPuestos: 1,
    baseSalary: 600_000,
    netSalary: 700_000,
    puestoTrabajo: { id: "pt-1", name: "Portería" },
    cargo: { id: "cargo-1", name: "Guardia" },
    rol: { id: "rol-1", name: "4x4" },
    ...over,
  };
}

function call() {
  return POST(new NextRequest(`http://localhost/api/cpq/quotes/${QUOTE_ID}/send-to-installation`, { method: "POST" }), {
    params: Promise.resolve({ id: QUOTE_ID }),
  });
}

beforeEach(() => {
  vi.clearAllMocks();
  mocks.requireAuth.mockResolvedValue(CTX);
  mocks.requireCpqEdit.mockResolvedValue(null);
  mocks.requireTenantModule.mockResolvedValue({ authorized: true });
  mocks.createOpsAuditLog.mockResolvedValue(undefined);
  mocks.syncPayrollItemForInstallation.mockResolvedValue({ action: "created" });
  mocks.createPuestoSalaryStructure.mockResolvedValue({ salaryStructureId: "ss-new", netSalaryEstimate: 700_000 });
  mocks.installationFindFirst.mockResolvedValue({
    id: INSTALLATION_ID,
    name: "Torre A",
    teMontoClp: 25_000,
    metadata: { otro: true },
  });
  for (const m of [
    mocks.pautaFindMany,
    mocks.asistenciaFindMany,
    mocks.asignacionFindMany,
    mocks.marcacionFindMany,
    mocks.turnoExtraFindMany,
    mocks.serieFindMany,
  ]) {
    m.mockResolvedValue([]);
  }
  mocks.puestoFindMany.mockResolvedValue([]);
  mocks.txPuestoUpdateMany.mockImplementation(async (args: { where: { id: { in: string[] } } }) => ({
    count: args.where.id.in.length,
  }));
  mocks.txPuestoDeleteMany.mockImplementation(async (args: { where: { id: { in: string[] } } }) => ({
    count: args.where.id.in.length,
  }));
  let seq = 0;
  mocks.txPuestoCreate.mockImplementation(async () => ({ id: `new-${++seq}` }));
  mocks.txInstallationUpdate.mockResolvedValue({});
});

describe("POST /api/cpq/quotes/[id]/send-to-installation", () => {
  it("crea puestos con sueldo bruto de la cotización, activeFrom = inicio de la programación y desactiva los con historial", async () => {
    mocks.quoteFindFirst.mockResolvedValue({
      id: QUOTE_ID,
      code: "COT-001",
      installationId: INSTALLATION_ID,
      positions: [
        position({ id: "pos-1", numPuestos: 2, numGuards: 2, baseSalary: 600_000, netSalary: 700_000 }),
        position({
          id: "pos-2",
          puestoTrabajoId: "pt-2",
          puestoTrabajo: { id: "pt-2", name: "Ronda" },
          numPuestos: 1,
          numGuards: 1,
          baseSalary: 550_000,
          netSalary: null,
        }),
      ],
    });
    mocks.loadInstallationServiceWindow.mockResolvedValue({
      startYmd: "2099-01-20",
      endYmd: null,
      source: "template",
    });
    mocks.puestoFindMany.mockResolvedValue([{ id: "old-hist" }, { id: "old-clean" }]);
    mocks.asignacionFindMany.mockResolvedValue([{ puestoId: "old-hist" }]);

    const res = await call();
    const body = await res.json();
    expect(res.status).toBe(200);
    expect(body.success).toBe(true);
    expect(body.data).toMatchObject({
      installationId: INSTALLATION_ID,
      installationName: "Torre A",
      startDate: "2099-01-20",
      deletedPuestos: 1,
      deactivatedPuestos: 1,
      createdPuestos: 3,
      salaryStructuresCreated: 3,
    });

    // Con historial → desactivado hasta el día anterior al inicio; sin historial → borrado.
    expect(mocks.txPuestoUpdateMany).toHaveBeenCalledTimes(1);
    const upd = mocks.txPuestoUpdateMany.mock.calls[0][0];
    expect(upd.where.id.in).toEqual(["old-hist"]);
    expect(upd.data.active).toBe(false);
    expect(upd.data.activeUntil.toISOString()).toBe("2099-01-19T00:00:00.000Z");
    expect(mocks.txPuestoDeleteMany).toHaveBeenCalledTimes(1);
    expect(mocks.txPuestoDeleteMany.mock.calls[0][0].where.id.in).toEqual(["old-clean"]);

    // numPuestos=2 → dos puestos con sufijo; requiredGuards = numGuards.
    expect(mocks.txPuestoCreate).toHaveBeenCalledTimes(3);
    const created = mocks.txPuestoCreate.mock.calls.map((c) => c[0].data);
    expect(created.map((d) => d.name)).toEqual([
      "Guardia - Portería #1",
      "Guardia - Portería #2",
      "Guardia - Ronda",
    ]);
    expect(created[0].requiredGuards).toBe(2);
    expect(created[0].baseSalary).toBe(600_000);
    expect(created[0].teMontoClp).toBe(25_000);
    expect(created[0].active).toBe(true);
    expect(created[0].activeFrom.toISOString()).toBe("2099-01-20T00:00:00.000Z");
    expect(created[0].installationId).toBe(INSTALLATION_ID);
    expect(created[0].tenantId).toBe("tenant-a");

    // Estructura de sueldo por puesto con el bruto y el líquido de la cotización.
    expect(mocks.createPuestoSalaryStructure).toHaveBeenCalledTimes(3);
    const ss = mocks.createPuestoSalaryStructure.mock.calls.map((c) => c[1]);
    expect(ss[0]).toMatchObject({
      tenantId: "tenant-a",
      puestoId: "new-1",
      baseSalary: 600_000,
      netSalaryEstimate: 700_000,
      createdBy: "u-1",
    });
    expect(ss[0].effectiveFrom.toISOString()).toBe("2099-01-20T00:00:00.000Z");
    expect(ss[2]).toMatchObject({ puestoId: "new-3", baseSalary: 550_000, netSalaryEstimate: null });
    // La transacción se pasa al helper (escrituras atómicas).
    expect(mocks.createPuestoSalaryStructure.mock.calls[0][0]).toBe(tx);

    // Snapshot en metadata preserva claves previas y registra inicio + numPuestos.
    const meta = mocks.txInstallationUpdate.mock.calls[0][0].data.metadata;
    expect(meta.otro).toBe(true);
    expect(meta.dotacionActiva.startDate).toBe("2099-01-20");
    expect(meta.dotacionActiva.items[0]).toMatchObject({ numPuestos: 2, baseSalary: 600_000, netSalary: 700_000 });

    // El flujo de caja se resincroniza.
    expect(mocks.syncPayrollItemForInstallation).toHaveBeenCalledWith("tenant-a", INSTALLATION_ID);
    expect(mocks.createOpsAuditLog).toHaveBeenCalledTimes(1);
  });

  it("sin programación ni fecha en la instalación usa hoy como inicio", async () => {
    mocks.quoteFindFirst.mockResolvedValue({
      id: QUOTE_ID,
      code: "COT-002",
      installationId: INSTALLATION_ID,
      positions: [position()],
    });
    mocks.loadInstallationServiceWindow.mockResolvedValue({ startYmd: null, endYmd: null, source: "none" });
    mocks.puestoFindMany.mockResolvedValue([{ id: "old-hist" }]);
    mocks.asistenciaFindMany.mockResolvedValue([{ puestoId: "old-hist" }]);

    const res = await call();
    const body = await res.json();
    expect(res.status).toBe(200);

    const today = new Date().toLocaleDateString("en-CA", { timeZone: "America/Santiago" });
    expect(body.data.startDate).toBe(today);
    expect(mocks.txPuestoCreate.mock.calls[0][0].data.activeFrom.toISOString()).toBe(`${today}T00:00:00.000Z`);
    // Servicio ya operando: los puestos reemplazados terminan hoy.
    expect(mocks.txPuestoUpdateMany.mock.calls[0][0].data.activeUntil.toISOString()).toBe(`${today}T00:00:00.000Z`);
    expect(mocks.txPuestoDeleteMany).not.toHaveBeenCalled();
  });

  it("no crea estructura de sueldo si la posición no tiene bruto", async () => {
    mocks.quoteFindFirst.mockResolvedValue({
      id: QUOTE_ID,
      code: "COT-003",
      installationId: INSTALLATION_ID,
      positions: [position({ baseSalary: 0, netSalary: null })],
    });
    mocks.loadInstallationServiceWindow.mockResolvedValue({ startYmd: "2099-02-01", endYmd: null, source: "template" });

    const res = await call();
    const body = await res.json();
    expect(res.status).toBe(200);
    expect(body.data.createdPuestos).toBe(1);
    expect(body.data.salaryStructuresCreated).toBe(0);
    expect(mocks.createPuestoSalaryStructure).not.toHaveBeenCalled();
    expect(mocks.txPuestoCreate.mock.calls[0][0].data.baseSalary).toBeNull();
  });

  it("400 si la cotización no está vinculada a una instalación", async () => {
    mocks.quoteFindFirst.mockResolvedValue({
      id: QUOTE_ID,
      code: "COT-004",
      installationId: null,
      positions: [position()],
    });
    const res = await call();
    expect(res.status).toBe(400);
    expect(mocks.txPuestoCreate).not.toHaveBeenCalled();
    expect(mocks.syncPayrollItemForInstallation).not.toHaveBeenCalled();
  });

  it("404 si la cotización es de otro tenant", async () => {
    mocks.quoteFindFirst.mockResolvedValue(null);
    const res = await call();
    expect(res.status).toBe(404);
    expect(mocks.quoteFindFirst.mock.calls[0][0].where).toMatchObject({ id: QUOTE_ID, tenantId: "tenant-a" });
  });
});
