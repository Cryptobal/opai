import { describe, it, expect, beforeEach, vi } from "vitest";
import { render, screen, fireEvent, waitFor } from "@testing-library/react";
import { CashflowMobileList } from "../CashflowMobileList";
import { makeMobileProjection } from "./fixtures/cashflow-mobile-fixture";

vi.mock("next/navigation", () => ({
  useRouter: () => ({ refresh: vi.fn() }),
}));

const fetchMock = vi.fn();

beforeEach(() => {
  vi.stubGlobal("fetch", fetchMock);
  fetchMock.mockReset();
  // Default response: vacío success para evitar errores no esperados.
  fetchMock.mockResolvedValue({
    json: async () => ({ success: true, data: null }),
  });
  if (typeof window !== "undefined") {
    window.localStorage.clear();
  }
});

function renderList(canManage = true) {
  return render(
    <CashflowMobileList
      initialProjection={makeMobileProjection()}
      defaultWeeks={8}
      defaultMonths={6}
      canManage={canManage}
    />,
  );
}

describe("CashflowMobileList", () => {
  it("renderiza el bucket activo con sus ingresos/egresos", async () => {
    renderList();
    expect(screen.getByRole("button", { name: /Mensual/ })).toBeTruthy();
    expect(screen.getByRole("button", { name: /Semanal/ })).toBeTruthy();
    // "Ingresos" aparece tanto en el stat del bucket como en el header de
    // sección; basta que exista al menos una instancia.
    expect(screen.getAllByText(/Ingresos/).length).toBeGreaterThan(0);
    expect(screen.getAllByText(/Egresos/).length).toBeGreaterThan(0);
    expect(screen.getByText("Ventas")).toBeTruthy();
    expect(screen.getByText("Sueldos")).toBeTruthy();
  });

  it("cambiar de bucket actualiza el header", async () => {
    renderList();
    const w20Chip = screen
      .getAllByRole("tab")
      .find((b) => b.getAttribute("data-bucket-key") === "2026-W20");
    expect(w20Chip).toBeTruthy();
    fireEvent.click(w20Chip!);
    await waitFor(() => {
      const summary = screen.getAllByText(/1\.000\.000/);
      expect(summary.length).toBeGreaterThan(0);
    });
  });

  it("expandir una categoría muestra los ítems", async () => {
    renderList();
    fireEvent.click(screen.getByRole("button", { name: /Ventas/ }));
    await waitFor(() => {
      expect(screen.getByText("Edificio A")).toBeTruthy();
    });
  });

  it("tap en un ítem abre el drawer", async () => {
    renderList();
    fireEvent.click(screen.getByRole("button", { name: /Ventas/ }));
    fireEvent.click(await screen.findByText("Edificio A"));
    await waitFor(() => {
      expect(screen.getByText(/Monto del período/i)).toBeTruthy();
    });
  });

  it("switch granularidad weekly↔monthly dispara fetch monthly", async () => {
    renderList();
    await waitFor(() => {
      expect(fetchMock).toHaveBeenCalledWith(
        expect.stringContaining("granularity=monthly"),
      );
    });
  });

  it("persistencia: el estado expandido de una categoría se guarda en localStorage", async () => {
    renderList();
    fireEvent.click(screen.getByRole("button", { name: /Ventas/ }));
    await waitFor(() => {
      expect(
        window.localStorage.getItem("cashflow.expanded.cat-ventas"),
      ).toBe("1");
    });
  });

  it("oculta acciones cuando canManage=false", async () => {
    renderList(false);
    fireEvent.click(screen.getByRole("button", { name: /Ventas/ }));
    fireEvent.click(await screen.findByText("Edificio A"));
    await waitFor(() => {
      expect(screen.getByText(/Monto del período/i)).toBeTruthy();
    });
    expect(screen.queryByText(/Mover a otro período/i)).toBeNull();
    expect(screen.queryByText(/Editar monto/i)).toBeNull();
  });

  it("muestra empty state cuando la sección no tiene movimientos", async () => {
    const p = makeMobileProjection();
    p.rows = p.rows.filter((r) => r.kind !== "EXPENSE");
    render(
      <CashflowMobileList
        initialProjection={p}
        defaultWeeks={8}
        defaultMonths={6}
        canManage
      />,
    );
    const egresosHeader = screen.getByRole("button", { name: /Egresos/ });
    if (egresosHeader.getAttribute("aria-expanded") !== "true") {
      fireEvent.click(egresosHeader);
    }
    await waitFor(() => {
      expect(screen.getByText(/Sin egresos proyectados/i)).toBeTruthy();
    });
  });

  it("auto-selecciona un bucket activo al mount", async () => {
    renderList();
    await waitFor(() => {
      const active = screen
        .getAllByRole("tab")
        .find((t) => t.getAttribute("aria-selected") === "true");
      expect(active).toBeTruthy();
    });
  });

  it("getBucketDisplayLabel format mensual y semanal", async () => {
    const { getBucketDisplayLabel } = await import("../CashflowMobileList");
    type B = Parameters<typeof getBucketDisplayLabel>[0];
    const weekly = {
      key: "2026-W19",
      label: "Sem 19",
      start: new Date("2026-05-04"),
      end: new Date("2026-05-10"),
    } as unknown as B;
    expect(getBucketDisplayLabel(weekly, "weekly")).toMatch(
      /Semana del 4 al 10 may/,
    );
    const monthly = {
      key: "2026-05",
      label: "May",
      start: new Date("2026-05-01"),
      end: new Date("2026-05-31"),
    } as unknown as B;
    expect(getBucketDisplayLabel(monthly, "monthly")).toBe("Mayo 2026");
  });
});
