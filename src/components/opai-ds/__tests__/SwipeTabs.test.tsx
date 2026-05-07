import { describe, expect, it, vi } from "vitest";
import { render, screen } from "@testing-library/react";
import { SwipeTabs } from "../SwipeTabs";

// Mock next/navigation usePathname
vi.mock("next/navigation", () => ({
  usePathname: () => "/finanzas/reportes/eerr",
}));

describe("SwipeTabs", () => {
  const items = [
    { href: "/finanzas/reportes", label: "Dashboard", exactMatch: true },
    { href: "/finanzas/reportes/eerr", label: "Estado de Resultado" },
    { href: "/finanzas/reportes/balance", label: "Balance General" },
  ];

  it("renders all items as tabs", () => {
    render(<SwipeTabs items={items} />);
    expect(screen.getByText("Dashboard")).toBeTruthy();
    expect(screen.getByText("Estado de Resultado")).toBeTruthy();
    expect(screen.getByText("Balance General")).toBeTruthy();
  });

  it("marks the active tab with aria-selected=true (longest prefix wins)", () => {
    render(<SwipeTabs items={items} />);
    const eerr = screen.getByText("Estado de Resultado").closest("a");
    const dashboard = screen.getByText("Dashboard").closest("a");
    expect(eerr?.getAttribute("aria-selected")).toBe("true");
    expect(dashboard?.getAttribute("aria-selected")).toBe("false");
  });

  it("respects exactMatch flag (Dashboard not active when on /eerr)", () => {
    render(<SwipeTabs items={items} />);
    const dashboard = screen.getByText("Dashboard").closest("a");
    // Even though /finanzas/reportes is a prefix of /finanzas/reportes/eerr,
    // exactMatch on Dashboard means it must be exactly /finanzas/reportes
    expect(dashboard?.getAttribute("aria-selected")).toBe("false");
  });

  it("renders nothing when items array is empty", () => {
    const { container } = render(<SwipeTabs items={[]} />);
    expect(container.firstChild).toBeNull();
  });

  it("renders trailingAction if provided", () => {
    render(
      <SwipeTabs
        items={items}
        trailingAction={<button>Acción</button>}
      />,
    );
    expect(screen.getByText("Acción")).toBeTruthy();
  });

  it("renders badge when present and non-zero", () => {
    const withBadge = [
      { href: "/a", label: "A", badge: 5 },
      { href: "/b", label: "B", badge: 0 }, // should be hidden
      { href: "/c", label: "C", badge: 200 }, // should render as 99+
    ];
    render(<SwipeTabs items={withBadge} />);
    expect(screen.getByText("5")).toBeTruthy();
    expect(screen.getByText("99+")).toBeTruthy();
    // Zero is hidden
    expect(screen.queryByText("0")).toBeNull();
  });
});
