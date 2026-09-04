// @vitest-environment node
import { beforeEach, describe, expect, it, vi } from "vitest";

const mocks = vi.hoisted(() => ({
  cpqCargoFindFirst: vi.fn(),
  cpqRolFindFirst: vi.fn(),
  cpqPuestoFindFirst: vi.fn(),
  bonoFindMany: vi.fn(),
  cpqCargoFindMany: vi.fn(),
  cpqRolFindMany: vi.fn(),
  cpqPuestoFindMany: vi.fn(),
  isTenantModuleEnabled: vi.fn(),
}));

vi.mock("@/lib/prisma", () => ({
  prisma: {
    cpqCargo: { findFirst: mocks.cpqCargoFindFirst, findMany: mocks.cpqCargoFindMany },
    cpqRol: { findFirst: mocks.cpqRolFindFirst, findMany: mocks.cpqRolFindMany },
    cpqPuestoTrabajo: { findFirst: mocks.cpqPuestoFindFirst, findMany: mocks.cpqPuestoFindMany },
    payrollBonoCatalog: { findMany: mocks.bonoFindMany },
  },
}));

vi.mock("@/lib/tenant-modules", () => ({
  isTenantModuleEnabled: mocks.isTenantModuleEnabled,
}));

const {
  parseIncludeIds,
  cpqCatalogWhere,
  bonoCatalogWhere,
  assertPuestoCatalogOwnership,
  loadPuestoFormCatalogs,
  INVALID_PUESTO_CATALOG_ERROR,
} = await import("../puesto-catalog");

const TENANT = "tenant-a";
const CARGO_ID = "11111111-1111-4111-8111-111111111111";
const ROL_ID = "22222222-2222-4222-8222-222222222222";
const PUESTO_ID = "33333333-3333-4333-8333-333333333333";
const BONO_ID = "44444444-4444-4444-8444-444444444444";
const FOREIGN_ID = "55555555-5555-4555-8555-555555555555";

beforeEach(() => {
  mocks.cpqCargoFindFirst.mockReset();
  mocks.cpqRolFindFirst.mockReset();
  mocks.cpqPuestoFindFirst.mockReset();
  mocks.bonoFindMany.mockReset();
  mocks.cpqCargoFindMany.mockReset().mockResolvedValue([]);
  mocks.cpqRolFindMany.mockReset().mockResolvedValue([]);
  mocks.cpqPuestoFindMany.mockReset().mockResolvedValue([]);
  mocks.isTenantModuleEnabled.mockReset().mockResolvedValue(true);
});

describe("parseIncludeIds", () => {
  it("acepta uuids y descarta basura, duplicados y no-uuid", () => {
    expect(
      parseIncludeIds(`${CARGO_ID},${CARGO_ID}, not-a-uuid, ${ROL_ID} `),
    ).toEqual([CARGO_ID, ROL_ID]);
  });

  it("devuelve vacío si el query está ausente", () => {
    expect(parseIncludeIds(null)).toEqual([]);
    expect(parseIncludeIds("")).toEqual([]);
  });
});

describe("catalog where", () => {
  it("cpq incluye tenant o globales y activos, más includeIds", () => {
    const where = cpqCatalogWhere(TENANT, [CARGO_ID]);
    expect(where.AND[0]).toEqual({ OR: [{ tenantId: TENANT }, { tenantId: null }] });
    expect(where.AND[1]).toEqual({
      OR: [{ active: true }, { id: { in: [CARGO_ID] } }],
    });
  });

  it("cpq sin includeIds solo activos", () => {
    const where = cpqCatalogWhere(TENANT, []);
    expect(where.AND[1]).toEqual({ active: true });
  });

  it("bonos filtran solo por tenant (nunca globales)", () => {
    expect(bonoCatalogWhere(TENANT, [])).toEqual({
      tenantId: TENANT,
      isActive: true,
    });
    expect(bonoCatalogWhere(TENANT, [BONO_ID])).toEqual({
      tenantId: TENANT,
      OR: [{ isActive: true }, { id: { in: [BONO_ID] } }],
    });
  });
});

describe("assertPuestoCatalogOwnership", () => {
  it("acepta cargo/rol/puesto del tenant o globales y bonos del tenant", async () => {
    mocks.cpqCargoFindFirst.mockResolvedValue({ id: CARGO_ID });
    mocks.cpqRolFindFirst.mockResolvedValue({ id: ROL_ID });
    mocks.cpqPuestoFindFirst.mockResolvedValue({ id: PUESTO_ID });
    mocks.bonoFindMany.mockResolvedValue([{ id: BONO_ID }]);

    const result = await assertPuestoCatalogOwnership(TENANT, {
      cargoId: CARGO_ID,
      rolId: ROL_ID,
      puestoTrabajoId: PUESTO_ID,
      bonos: [{ bonoCatalogId: BONO_ID }],
    });
    expect(result).toBeNull();
    expect(mocks.cpqCargoFindFirst).toHaveBeenCalledWith({
      where: { id: CARGO_ID, OR: [{ tenantId: TENANT }, { tenantId: null }] },
      select: { id: true },
    });
    expect(mocks.bonoFindMany).toHaveBeenCalledWith({
      where: { id: { in: [BONO_ID] }, tenantId: TENANT },
      select: { id: true },
    });
  });

  it("rechaza un cargoId ajeno al tenant", async () => {
    mocks.cpqCargoFindFirst.mockResolvedValue(null);
    const result = await assertPuestoCatalogOwnership(TENANT, { cargoId: FOREIGN_ID });
    expect(result).not.toBeNull();
    expect(result?.status).toBe(400);
    const json = await result!.json();
    expect(json).toEqual({ success: false, error: INVALID_PUESTO_CATALOG_ERROR });
  });

  it("rechaza un bonoCatalogId de otro tenant", async () => {
    mocks.bonoFindMany.mockResolvedValue([]);
    const result = await assertPuestoCatalogOwnership(TENANT, {
      bonos: [{ bonoCatalogId: FOREIGN_ID }],
    });
    expect(result?.status).toBe(400);
  });

  it("no valida ids ausentes o nulos", async () => {
    const result = await assertPuestoCatalogOwnership(TENANT, {
      cargoId: null,
      rolId: undefined,
      bonos: [{ bonoCatalogId: "" }, { bonoCatalogId: null }],
    });
    expect(result).toBeNull();
    expect(mocks.cpqCargoFindFirst).not.toHaveBeenCalled();
    expect(mocks.bonoFindMany).not.toHaveBeenCalled();
  });
});

describe("loadPuestoFormCatalogs", () => {
  it("omite bonos si el tenant no tiene módulo payroll", async () => {
    mocks.isTenantModuleEnabled.mockResolvedValue(false);
    mocks.cpqCargoFindMany.mockResolvedValue([
      { id: CARGO_ID, name: "Guardia", description: null, active: true },
    ]);

    const data = await loadPuestoFormCatalogs(TENANT, []);
    expect(data.payrollEnabled).toBe(false);
    expect(data.bonos).toEqual([]);
    expect(data.cargos).toHaveLength(1);
    expect(mocks.bonoFindMany).not.toHaveBeenCalled();
  });

  it("incluye inactivos referenciados y serializa montos de bono", async () => {
    mocks.isTenantModuleEnabled.mockResolvedValue(true);
    mocks.bonoFindMany.mockResolvedValue([
      {
        id: BONO_ID,
        code: "RESP",
        name: "Bono responsabilidad",
        bonoType: "FIJO",
        isTaxable: true,
        isTributable: true,
        defaultAmount: { toString: () => "35000" },
        defaultPercentage: null,
        conditionType: null,
        isActive: false,
      },
    ]);

    const data = await loadPuestoFormCatalogs(TENANT, [BONO_ID]);
    expect(data.bonos).toEqual([
      expect.objectContaining({
        id: BONO_ID,
        defaultAmount: 35000,
        defaultPercentage: null,
        active: false,
      }),
    ]);
    expect(mocks.bonoFindMany.mock.calls[0][0].where).toEqual(
      bonoCatalogWhere(TENANT, [BONO_ID]),
    );
  });
});
