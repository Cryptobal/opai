// @vitest-environment node
import { beforeEach, describe, expect, it, vi } from "vitest";
import { NextRequest, NextResponse } from "next/server";

const mocks = vi.hoisted(() => ({
  requireAuth: vi.fn(),
  ensureOpsAccess: vi.fn(),
  cpqCargoFindFirst: vi.fn(),
  cpqRolFindFirst: vi.fn(),
  cpqPuestoFindFirst: vi.fn(),
  bonoFindMany: vi.fn(),
  installationFindFirst: vi.fn(),
  puestoCreate: vi.fn(),
}));

vi.mock("@/lib/api-auth", async () => {
  const { NextResponse: NR } = await import("next/server");
  return {
    requireAuth: mocks.requireAuth,
    unauthorized: () => NR.json({ success: false, error: "No autorizado" }, { status: 401 }),
    parseBody: async (
      req: Request,
      schema: {
        safeParse: (raw: unknown) => {
          success: boolean;
          data?: unknown;
          error?: { issues: Array<{ path: (string | number)[]; message: string }> };
        };
      },
    ) => {
      const raw = await req.json();
      const result = schema.safeParse(raw);
      if (!result.success) {
        const issues = (result.error?.issues ?? [])
          .map((i) => `${i.path.join(".")}: ${i.message}`)
          .join("; ");
        return {
          error: NR.json({ success: false, error: issues }, { status: 400 }),
        };
      }
      return { data: result.data };
    },
  };
});

vi.mock("@/lib/ops", () => ({
  ensureOpsAccess: mocks.ensureOpsAccess,
  createOpsAuditLog: vi.fn(),
}));

vi.mock("@/modules/payroll/engine/simulate-payslip", () => ({
  simulatePayslip: vi.fn(),
}));

vi.mock("@/modules/payroll/resolve-structure-allowances", () => ({
  resolveStructureAllowances: vi.fn(),
}));

vi.mock("@/modules/finance/cashflow/generators/payroll-sync", () => ({
  syncPayrollItemForInstallation: vi.fn(),
}));

vi.mock("@/lib/prisma", () => ({
  prisma: {
    cpqCargo: { findFirst: mocks.cpqCargoFindFirst },
    cpqRol: { findFirst: mocks.cpqRolFindFirst },
    cpqPuestoTrabajo: { findFirst: mocks.cpqPuestoFindFirst },
    payrollBonoCatalog: { findMany: mocks.bonoFindMany },
    crmInstallation: { findFirst: mocks.installationFindFirst },
    opsPuestoOperativo: { create: mocks.puestoCreate },
  },
}));

const { POST } = await import("../route");

const OPS_CTX = {
  userId: "u-ops",
  tenantId: "tenant-a",
  userEmail: "jefe@ops.cl",
  userRole: "jefe_operaciones",
  roleTemplateId: null,
};

const FOREIGN_CARGO = "55555555-5555-4555-8555-555555555555";
const INSTALLATION_ID = "66666666-6666-4666-8666-666666666666";

function createPuestoReq(cargoId: string) {
  return new NextRequest("http://localhost/api/ops/puestos", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({
      installationId: INSTALLATION_ID,
      name: "Guardia portería",
      cargoId,
      shiftStart: "08:00",
      shiftEnd: "20:00",
      weekdays: ["Lun", "Mar", "Mié", "Jue", "Vie"],
      requiredGuards: 1,
    }),
  });
}

beforeEach(() => {
  mocks.requireAuth.mockReset().mockResolvedValue(OPS_CTX);
  mocks.ensureOpsAccess.mockReset().mockResolvedValue(null);
  mocks.cpqCargoFindFirst.mockReset().mockResolvedValue(null);
  mocks.cpqRolFindFirst.mockReset();
  mocks.cpqPuestoFindFirst.mockReset();
  mocks.bonoFindMany.mockReset();
  mocks.installationFindFirst.mockReset();
  mocks.puestoCreate.mockReset();
});

describe("POST /api/ops/puestos catalog ownership", () => {
  it("rechaza cargoId de otro tenant con 400 y no persiste", async () => {
    const res = await POST(createPuestoReq(FOREIGN_CARGO));
    expect(res.status).toBe(400);
    const json = await res.json();
    expect(json).toEqual({
      success: false,
      error: "Catálogo inválido para este tenant",
    });
    expect(mocks.installationFindFirst).not.toHaveBeenCalled();
    expect(mocks.puestoCreate).not.toHaveBeenCalled();
  });
});
