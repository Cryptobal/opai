import { beforeEach, describe, expect, it, vi } from "vitest";

const unstableCacheMock = vi.fn((fn: () => unknown) => () => fn());

vi.mock("next/cache", () => ({
  unstable_cache: (fn: () => unknown, ...rest: unknown[]) =>
    unstableCacheMock(fn, ...rest),
  revalidateTag: vi.fn(),
}));

const logPlatformAction = vi.fn();
const hasPlatformAuditToday = vi.fn();

vi.mock("@/lib/platform/audit", () => ({
  logPlatformAction: (...args: unknown[]) => logPlatformAction(...args),
  hasPlatformAuditToday: (...args: unknown[]) => hasPlatformAuditToday(...args),
}));

vi.mock("@/lib/prisma", () => ({
  prisma: {
    tenantModule: {
      findMany: vi.fn(),
      createMany: vi.fn(),
    },
    tenantPlan: {
      findUnique: vi.fn(),
    },
    planCatalog: {
      findUnique: vi.fn(),
    },
  },
}));

import { ALL_MODULES, getTenantEnabledModules } from "@/lib/tenant-modules";
import { prisma } from "@/lib/prisma";

const findMany = prisma.tenantModule.findMany as unknown as ReturnType<typeof vi.fn>;
const createMany = prisma.tenantModule.createMany as unknown as ReturnType<typeof vi.fn>;
const planFind = prisma.tenantPlan.findUnique as unknown as ReturnType<typeof vi.fn>;
const catalogFind = prisma.planCatalog.findUnique as unknown as ReturnType<typeof vi.fn>;

describe("getTenantEnabledModules / fetchTenantEnabledModuleKeys", () => {
  beforeEach(() => {
    findMany.mockReset();
    createMany.mockReset();
    planFind.mockReset();
    catalogFind.mockReset();
    logPlatformAction.mockReset();
    hasPlatformAuditToday.mockReset();
    hasPlatformAuditToday.mockResolvedValue(false);
    createMany.mockResolvedValue({ count: 0 });
    unstableCacheMock.mockReset();
    unstableCacheMock.mockImplementation((fn: () => unknown) => () => fn());
    vi.spyOn(console, "error").mockImplementation(() => {});
    vi.spyOn(console, "warn").mockImplementation(() => {});
  });

  it("cero filas → módulos del PlanCatalog (nunca ALL_MODULES)", async () => {
    findMany.mockResolvedValue([]);
    planFind.mockResolvedValue({ plan: "starter" });
    catalogFind.mockResolvedValue({
      includedModules: ["hub", "config", "ops_pauta"],
    });

    const enabled = await getTenantEnabledModules("tenant-legacy");

    expect(enabled).toEqual(new Set(["hub", "config", "ops_pauta"]));
    expect(enabled.size).toBeLessThan(ALL_MODULES.length);
    expect(createMany).toHaveBeenCalled();
    expect(logPlatformAction).toHaveBeenCalledWith(
      expect.objectContaining({ action: "lifecycle.modules_materialized" }),
    );
    expect(console.error).toHaveBeenCalled();
  });

  it("cero filas y catálogo vacío del plan → starter", async () => {
    findMany.mockResolvedValue([]);
    planFind.mockResolvedValue({ plan: "enterprise" });
    catalogFind
      .mockResolvedValueOnce({ includedModules: [] })
      .mockResolvedValueOnce({ includedModules: ["hub", "personas"] });

    const enabled = await getTenantEnabledModules("tenant-no-plan-mods");

    expect(enabled).toEqual(new Set(["hub", "personas"]));
    expect(catalogFind).toHaveBeenCalledTimes(2);
  });

  it("filas con al menos una habilitada → solo habilitadas", async () => {
    findMany.mockResolvedValue([
      { module: "hub", enabled: true },
      { module: "crm", enabled: false },
      { module: "ops_pauta", enabled: true },
    ]);

    const enabled = await getTenantEnabledModules("tenant-partial");

    expect(enabled).toEqual(new Set(["hub", "ops_pauta"]));
    expect(enabled.has("crm")).toBe(false);
  });

  it("filas todas deshabilitadas → conjunto vacío (no fail-open)", async () => {
    findMany.mockResolvedValue([
      { module: "hub", enabled: false },
      { module: "crm", enabled: false },
    ]);

    const enabled = await getTenantEnabledModules("tenant-all-off");

    expect(enabled.size).toBe(0);
    expect(enabled).toEqual(new Set());
  });

  it("sin Data Cache (Auth.js/API) → lee BD sin unstable_cache", async () => {
    unstableCacheMock.mockImplementation(() => () => {
      throw new Error(
        "Invariant: incrementalCache missing in unstable_cache ()=>l(e)",
      );
    });
    findMany.mockResolvedValue([
      { module: "hub", enabled: true },
      { module: "crm", enabled: false },
    ]);

    const enabled = await getTenantEnabledModules("tenant-api");

    expect(enabled).toEqual(new Set(["hub"]));
    expect(findMany).toHaveBeenCalledTimes(1);
  });
});
