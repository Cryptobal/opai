import { beforeEach, describe, expect, it, vi } from "vitest";

vi.mock("next/cache", () => ({
  unstable_cache: (fn: () => unknown) => () => fn(),
  revalidateTag: vi.fn(),
}));

vi.mock("@/lib/prisma", () => ({
  prisma: {
    tenantModule: {
      findMany: vi.fn(),
    },
  },
}));

import { ALL_MODULES, getTenantEnabledModules } from "@/lib/tenant-modules";
import { prisma } from "@/lib/prisma";

const findMany = prisma.tenantModule.findMany as unknown as ReturnType<
  typeof vi.fn
>;

describe("getTenantEnabledModules / fetchTenantEnabledModuleKeys", () => {
  beforeEach(() => {
    findMany.mockReset();
    vi.spyOn(console, "warn").mockImplementation(() => {});
  });

  it("cero filas → ALL_MODULES (compat legado)", async () => {
    findMany.mockResolvedValue([]);

    const enabled = await getTenantEnabledModules("tenant-legacy");

    expect(findMany).toHaveBeenCalledWith({
      where: { tenantId: "tenant-legacy" },
      select: { module: true, enabled: true },
    });
    expect(enabled).toEqual(new Set(ALL_MODULES));
    expect(console.warn).toHaveBeenCalled();
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
});
