import { describe, expect, it } from "vitest";
import { isPlatformNavActive, PLATFORM_NAV } from "@/lib/platform/nav";

describe("platform nav", () => {
  it("marca Overview solo en /platform y /platform/dashboard", () => {
    const overview = PLATFORM_NAV.find((i) => i.href === "/platform")!;
    expect(isPlatformNavActive("/platform", overview)).toBe(true);
    expect(isPlatformNavActive("/platform/dashboard", overview)).toBe(true);
    expect(isPlatformNavActive("/platform/tenants", overview)).toBe(false);
  });

  it("Nuevo tenant no activa Tenants", () => {
    const tenants = PLATFORM_NAV.find((i) => i.href === "/platform/tenants")!;
    expect(isPlatformNavActive("/platform/tenants", tenants)).toBe(true);
    expect(isPlatformNavActive("/platform/tenants/abc", tenants)).toBe(true);
    expect(isPlatformNavActive("/platform/tenants/new", tenants)).toBe(false);
  });

  it("Catálogo exige owner", () => {
    const catalog = PLATFORM_NAV.find((i) => i.href === "/platform/catalog")!;
    expect(catalog.minRole).toBe("owner");
  });
});
