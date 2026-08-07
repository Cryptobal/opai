/** @vitest-environment jsdom */
import { describe, expect, it, vi, beforeEach } from "vitest";
import type { ReactNode } from "react";
import { fireEvent, render, screen } from "@testing-library/react";
import { Menu } from "lucide-react";
import type { RolePermissions } from "@/lib/permissions";
import { getDefaultPermissions } from "@/lib/permissions";
import {
  IslandModuleProvider,
  useSetIslandModuleMenu,
  useSetIslandSearch,
  useSetIslandSuppressed,
  useSetBreadcrumbTrailing,
  BreadcrumbTrailingProvider,
  IslandActionProvider,
} from "@/components/opai-ds";

const mockPush = vi.fn();
let mockPermissions: RolePermissions = getDefaultPermissions("owner");
let mockPathname = "/crm/correos";

vi.mock("next/navigation", () => ({
  useRouter: () => ({ push: mockPush, back: vi.fn() }),
  usePathname: () => mockPathname,
}));

vi.mock("@/lib/permissions-context", () => ({
  usePermissions: () => mockPermissions,
}));

vi.mock("@/contexts/TenantModulesContext", () => ({
  useTenantModules: () => ({ isModuleEnabled: () => true }),
}));

vi.mock("../ThemeLogo", () => ({
  ThemeLogo: () => <div data-testid="theme-logo" />,
}));

vi.mock("../SurfaceSegment", () => ({
  SurfaceSegment: () => <div data-testid="surface-segment" />,
}));

vi.mock("../nav-progress-bus", () => ({
  startNavProgress: vi.fn(),
}));

import { MobileIsland } from "../MobileIsland";

function MenuPublisher({ badge }: { badge?: number }) {
  useSetIslandModuleMenu({
    icon: Menu,
    label: "Carpetas y filtros",
    badge,
    onOpen: () => {},
  });
  return null;
}

function SuppressPublisher() {
  useSetIslandSuppressed(true);
  return null;
}

function Shell({
  children,
  badge,
  suppress,
  onSearch = vi.fn(),
  publishMenu = true,
}: {
  children?: ReactNode;
  badge?: number;
  suppress?: boolean;
  onSearch?: () => void;
  publishMenu?: boolean;
}) {
  return (
    <BreadcrumbTrailingProvider>
      <IslandActionProvider>
        <IslandModuleProvider>
          {suppress ? (
            <SuppressPublisher />
          ) : publishMenu ? (
            <MenuPublisher badge={badge} />
          ) : null}
          {children}
          <MobileIsland
            onSearch={onSearch}
            onToggleChat={vi.fn()}
            onToggleNotifications={vi.fn()}
            chatUnread={0}
            notifUnread={0}
          />
        </IslandModuleProvider>
      </IslandActionProvider>
    </BreadcrumbTrailingProvider>
  );
}

describe("MobileIsland — Zona C'", () => {
  beforeEach(() => {
    mockPermissions = getDefaultPermissions("owner");
    mockPathname = "/crm/correos";
    mockPush.mockReset();
    // matchMedia para hideChat / hideSearch
    Object.defineProperty(window, "matchMedia", {
      writable: true,
      value: (query: string) => ({
        matches: false,
        media: query,
        addEventListener: vi.fn(),
        removeEventListener: vi.fn(),
      }),
    });
  });

  it("renderiza el botón de módulo con badge 99+", () => {
    render(<Shell badge={120} />);
    const btn = screen.getByRole("button", { name: /Carpetas y filtros/i });
    expect(btn).toBeTruthy();
    expect(btn.textContent).toMatch(/99\+/);
  });

  it("no renderiza menú de módulo en modo detalle", () => {
    function Trailing() {
      useSetBreadcrumbTrailing("Hilo de prueba");
      return null;
    }
    render(
      <Shell>
        <Trailing />
      </Shell>,
    );
    expect(screen.queryByRole("button", { name: /Carpetas y filtros/i })).toBeNull();
  });

  it("devuelve null cuando suppressed", () => {
    const { container } = render(<Shell suppress />);
    expect(container.querySelector("header")).toBeNull();
  });

  it("Buscar global abre el Command Palette de inmediato (sin campo intermedio)", () => {
    mockPathname = "/cpq/quotes";
    const onSearch = vi.fn();
    render(<Shell onSearch={onSearch} publishMenu={false} />);
    fireEvent.click(screen.getByRole("button", { name: "Buscar" }));
    expect(onSearch).toHaveBeenCalledTimes(1);
    // No entra en modo campo inline de la isla
    expect(screen.queryByRole("searchbox")).toBeNull();
  });

  it("con búsqueda de módulo, Buscar abre el campo inline (no el palette)", () => {
    mockPathname = "/crm/correos";
    const onSearch = vi.fn();
    function SearchPublisher() {
      useSetIslandSearch({
        value: "",
        onChange: () => {},
        placeholder: "Buscar correos…",
      });
      return null;
    }
    render(
      <Shell onSearch={onSearch} publishMenu={false}>
        <SearchPublisher />
      </Shell>,
    );
    fireEvent.click(screen.getByRole("button", { name: "Buscar" }));
    expect(onSearch).not.toHaveBeenCalled();
    expect(screen.getByRole("searchbox")).toBeTruthy();
    expect(screen.getByPlaceholderText("Buscar correos…")).toBeTruthy();
  });
});
