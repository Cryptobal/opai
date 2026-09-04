// @vitest-environment node
import { beforeEach, describe, expect, it, vi } from "vitest";
import { NextRequest, NextResponse } from "next/server";

const mocks = vi.hoisted(() => ({
  requireAuth: vi.fn(),
  ensureModuleAccess: vi.fn(),
  ensureOpsAccess: vi.fn(),
  requireTenantModule: vi.fn(),
  simulatePayslip: vi.fn(),
}));

vi.mock("@/lib/api-auth", () => ({
  requireAuth: mocks.requireAuth,
  ensureModuleAccess: mocks.ensureModuleAccess,
  unauthorized: () =>
    NextResponse.json({ success: false, error: "No autorizado" }, { status: 401 }),
}));

vi.mock("@/lib/ops", () => ({
  ensureOpsAccess: mocks.ensureOpsAccess,
}));

vi.mock("@/lib/require-module", () => ({
  requireTenantModule: mocks.requireTenantModule,
}));

vi.mock("@/modules/payroll/engine/simulate-payslip", () => ({
  simulatePayslip: mocks.simulatePayslip,
}));

const { POST } = await import("../route");

const OPS_CTX = {
  userId: "u-ops",
  tenantId: "tenant-a",
  userEmail: "jefe@ops.cl",
  userRole: "jefe_operaciones",
  roleTemplateId: null,
};

const PAYSLIP = {
  haberes: {
    gross_salary: 700000,
    total_taxable: 687500,
    total_non_taxable: 0,
    net_salary: 560000,
    base_salary: 550000,
    gratification: 137500,
    meal: 0,
    transport: 0,
  },
  net_salary: 560000,
  total_deductions: 140000,
  total_employer_cost: 800000,
  deductions: {
    afp: { amount: 55000, total_rate: 0.1 },
    health: { amount: 38500, rate: 0.07 },
    afc: { amount: 3300, total_rate: 0.006 },
    tax: { amount: 0 },
  },
};

function estimateReq() {
  return new NextRequest("http://localhost/api/payroll/estimate-net", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ baseSalary: 550000 }),
  });
}

beforeEach(() => {
  mocks.requireAuth.mockReset().mockResolvedValue(OPS_CTX);
  mocks.ensureModuleAccess.mockReset().mockResolvedValue(
    NextResponse.json({ success: false, error: "Sin permisos para módulo PAYROLL" }, { status: 403 }),
  );
  mocks.ensureOpsAccess.mockReset().mockResolvedValue(null);
  mocks.requireTenantModule.mockReset().mockResolvedValue({ authorized: true, ctx: OPS_CTX });
  mocks.simulatePayslip.mockReset().mockResolvedValue(PAYSLIP);
});

describe("POST /api/payroll/estimate-net ops access", () => {
  it("permite a un rol ops estimar líquido aunque payroll esté en none", async () => {
    const res = await POST(estimateReq());
    expect(res.status).toBe(200);
    const json = await res.json();
    expect(json.data.netSalary).toBe(560000);
    expect(mocks.ensureOpsAccess).toHaveBeenCalledWith(OPS_CTX);
    expect(mocks.simulatePayslip).toHaveBeenCalled();
  });

  it("sigue en 403 si no hay payroll ni ops", async () => {
    mocks.ensureOpsAccess.mockResolvedValue(
      NextResponse.json({ success: false, error: "Sin permisos para módulo Ops" }, { status: 403 }),
    );
    const res = await POST(estimateReq());
    expect(res.status).toBe(403);
    expect(mocks.simulatePayslip).not.toHaveBeenCalled();
  });

  it("mantiene requireTenantModule: tenant sin payroll no estima", async () => {
    mocks.requireTenantModule.mockResolvedValue({
      authorized: false,
      response: NextResponse.json(
        { success: false, error: "Módulo no habilitado", code: "MODULE_NOT_ENABLED" },
        { status: 403 },
      ),
    });
    const res = await POST(estimateReq());
    expect(res.status).toBe(403);
    const json = await res.json();
    expect(json.code).toBe("MODULE_NOT_ENABLED");
    expect(mocks.simulatePayslip).not.toHaveBeenCalled();
  });
});
