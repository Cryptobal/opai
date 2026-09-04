// @vitest-environment node
import { beforeEach, describe, expect, it, vi } from "vitest";
import { NextRequest, NextResponse } from "next/server";
import { readFileSync } from "node:fs";
import path from "node:path";

const mocks = vi.hoisted(() => ({
  requireAuth: vi.fn(),
  ensureOpsAccess: vi.fn(),
  cpqCargoFindMany: vi.fn(),
  cpqRolFindMany: vi.fn(),
  cpqPuestoFindMany: vi.fn(),
  bonoFindMany: vi.fn(),
  isTenantModuleEnabled: vi.fn(),
}));

vi.mock("@/lib/api-auth", () => ({
  requireAuth: mocks.requireAuth,
  unauthorized: () =>
    NextResponse.json({ success: false, error: "No autorizado" }, { status: 401 }),
}));

vi.mock("@/lib/ops", () => ({
  ensureOpsAccess: mocks.ensureOpsAccess,
}));

vi.mock("@/lib/tenant-modules", () => ({
  isTenantModuleEnabled: mocks.isTenantModuleEnabled,
}));

vi.mock("@/lib/prisma", () => ({
  prisma: {
    cpqCargo: { findMany: mocks.cpqCargoFindMany },
    cpqRol: { findMany: mocks.cpqRolFindMany },
    cpqPuestoTrabajo: { findMany: mocks.cpqPuestoFindMany },
    payrollBonoCatalog: { findMany: mocks.bonoFindMany },
  },
}));

const { GET } = await import("../route");

const OPS_CTX = {
  userId: "u-ops",
  tenantId: "tenant-a",
  userEmail: "jefe@ops.cl",
  userRole: "jefe_operaciones",
  roleTemplateId: null,
};

const CARGO_ID = "11111111-1111-4111-8111-111111111111";

beforeEach(() => {
  mocks.requireAuth.mockReset().mockResolvedValue(OPS_CTX);
  mocks.ensureOpsAccess.mockReset().mockResolvedValue(null);
  mocks.isTenantModuleEnabled.mockReset().mockResolvedValue(true);
  mocks.cpqCargoFindMany.mockReset().mockResolvedValue([
    { id: CARGO_ID, name: "Guardia", description: null, active: true },
  ]);
  mocks.cpqRolFindMany.mockReset().mockResolvedValue([]);
  mocks.cpqPuestoFindMany.mockReset().mockResolvedValue([]);
  mocks.bonoFindMany.mockReset().mockResolvedValue([]);
});

describe("GET /api/ops/puestos/catalogos", () => {
  it("no usa guards CPQ/Payroll ni requireTenantModule", () => {
    const src = readFileSync(path.join(__dirname, "../route.ts"), "utf8");
    expect(src).toContain("ensureOpsAccess");
    expect(src).not.toContain("requireCpqView");
    expect(src).not.toContain("requireTenantModule");
    expect(src).not.toMatch(/\bensureModuleAccess\b/);
  });

  it("rol ops obtiene cargos del tenant (y globales)", async () => {
    const res = await GET(new NextRequest("http://localhost/api/ops/puestos/catalogos"));
    expect(res.status).toBe(200);
    const json = await res.json();
    expect(json.success).toBe(true);
    expect(json.data.cargos).toEqual([
      { id: CARGO_ID, name: "Guardia", description: null, active: true },
    ]);
    expect(mocks.ensureOpsAccess).toHaveBeenCalledWith(OPS_CTX);
  });

  it("sin acceso ops responde 403", async () => {
    mocks.ensureOpsAccess.mockResolvedValue(
      NextResponse.json({ success: false, error: "Sin permisos para módulo Ops" }, { status: 403 }),
    );
    const res = await GET(new NextRequest("http://localhost/api/ops/puestos/catalogos"));
    expect(res.status).toBe(403);
    expect(mocks.cpqCargoFindMany).not.toHaveBeenCalled();
  });

  it("sin sesión responde 401", async () => {
    mocks.requireAuth.mockResolvedValue(null);
    const res = await GET(new NextRequest("http://localhost/api/ops/puestos/catalogos"));
    expect(res.status).toBe(401);
  });
});
