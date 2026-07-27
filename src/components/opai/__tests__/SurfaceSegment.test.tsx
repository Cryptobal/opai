/** @vitest-environment jsdom */
import { describe, expect, it, vi, beforeEach } from "vitest";
import { render, screen } from "@testing-library/react";
import type { RolePermissions } from "@/lib/permissions";
import { getDefaultPermissions } from "@/lib/permissions";

const mockPush = vi.fn();
const mockRefresh = vi.fn();
let mockPermissions: RolePermissions = getDefaultPermissions("owner");

vi.mock("next/navigation", () => ({
  useRouter: () => ({ push: mockPush, refresh: mockRefresh }),
  usePathname: () => "/hub",
}));

vi.mock("@/lib/permissions-context", () => ({
  usePermissions: () => mockPermissions,
}));

vi.mock("@/contexts/TenantModulesContext", () => ({
  useTenantModules: () => ({ isModuleEnabled: () => true }),
}));

vi.mock("../nav-progress-bus", () => ({
  startNavProgress: vi.fn(),
}));

import { SurfaceSegment } from "../SurfaceSegment";

function stripProductividad(perms: RolePermissions): RolePermissions {
  return {
    ...perms,
    modules: { ...perms.modules, productividad: "none" },
    submodules: {
      ...perms.submodules,
      "productividad.correos": "none",
      "productividad.agenda": "none",
      "productividad.tareas": "none",
    },
  };
}

describe("SurfaceSegment", () => {
  beforeEach(() => {
    mockPermissions = getDefaultPermissions("owner");
    mockPush.mockReset();
    mockRefresh.mockReset();
  });

  it("sin acceso a Productividad → null", () => {
    mockPermissions = stripProductividad(getDefaultPermissions("owner"));
    const { container } = render(
      <SurfaceSegment surface="erp" variant="compact" />,
    );
    expect(container.firstChild).toBeNull();
  });

  it("con acceso → dos botones con aria-pressed correcto", () => {
    render(<SurfaceSegment surface="erp" variant="labeled" />);
    const erp = screen.getByRole("button", { name: "ERP" });
    const prod = screen.getByRole("button", { name: "Productividad" });
    expect(erp).toHaveAttribute("aria-pressed", "true");
    expect(prod).toHaveAttribute("aria-pressed", "false");
  });

  it("superficie productividad marca el botón correcto", () => {
    render(<SurfaceSegment surface="productividad" variant="compact" />);
    expect(screen.getByRole("button", { name: "Productividad" })).toHaveAttribute(
      "aria-pressed",
      "true",
    );
    expect(screen.getByRole("button", { name: "ERP" })).toHaveAttribute(
      "aria-pressed",
      "false",
    );
  });
});
