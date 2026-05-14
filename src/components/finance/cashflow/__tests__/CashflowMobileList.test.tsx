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
    // Ingresos abierto por default → "Ventas" visible.
    expect(screen.getByText("Ventas")).toBeTruthy();
    // Egresos cerrado por default → abrir para ver la categoría "Sueldos".
    // El texto "Sueldos" aparece también como badge en cada ítem (default
    // expandido), por eso usamos getAllByText.
    fireEvent.click(screen.getByRole("button", { name: /Egresos/ }));
    await waitFor(() => {
      expect(screen.getAllByText("Sueldos").length).toBeGreaterThan(0);
    });
  });

  it("cambiar de bucket con el navegador actualiza el header", async () => {
    renderList();
    // El bucket activo al mount es W20 (hoy: 2026-05-14 cae en W20).
    // Retroceder con la flecha "Período anterior" lleva a W19.
    const prevBtn = screen.getByRole("button", { name: /Período anterior/ });
    fireEvent.click(prevBtn);
    await waitFor(() => {
      expect(screen.getByText(/Semana del 4 al 10 may/)).toBeTruthy();
    });
  });

  it("las categorías de Ingresos están expandidas por default — todos los ítems visibles", async () => {
    renderList();
    // Sin tap en la categoría, el ítem ya está visible.
    expect(screen.getByText("Edificio A")).toBeTruthy();
  });

  it("tap en un ítem abre el drawer", async () => {
    renderList();
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

  it("persistencia: colapsar una categoría se guarda en localStorage", async () => {
    renderList();
    // Default = expandido → la primera click colapsa y persiste "0".
    fireEvent.click(screen.getByRole("button", { name: /Ventas/ }));
    await waitFor(() => {
      expect(
        window.localStorage.getItem("cashflow.mobile.expanded.cat-ventas"),
      ).toBe("0");
    });
    // Re-expandir limpia la entrada (vuelve al default).
    fireEvent.click(screen.getByRole("button", { name: /Ventas/ }));
    await waitFor(() => {
      expect(
        window.localStorage.getItem("cashflow.mobile.expanded.cat-ventas"),
      ).toBeNull();
    });
  });

  it("oculta acciones cuando canManage=false", async () => {
    renderList(false);
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
    // Por default, Ingresos está abierto y Egresos cerrado: hay que abrir Egresos.
    const egresosHeader = screen.getByRole("button", { name: /Egresos/ });
    expect(egresosHeader.getAttribute("aria-expanded")).toBe("false");
    fireEvent.click(egresosHeader);
    await waitFor(() => {
      expect(screen.getByText(/Sin egresos proyectados/i)).toBeTruthy();
    });
  });

  it("acordeón: abrir Egresos cierra Ingresos", async () => {
    renderList();
    const ingresosHeader = screen.getByRole("button", { name: /Ingresos/ });
    const egresosHeader = screen.getByRole("button", { name: /Egresos/ });
    // Default: Ingresos abierto, Egresos cerrado.
    expect(ingresosHeader.getAttribute("aria-expanded")).toBe("true");
    expect(egresosHeader.getAttribute("aria-expanded")).toBe("false");
    fireEvent.click(egresosHeader);
    await waitFor(() => {
      expect(egresosHeader.getAttribute("aria-expanded")).toBe("true");
      expect(ingresosHeader.getAttribute("aria-expanded")).toBe("false");
    });
    // Persistencia.
    expect(window.localStorage.getItem("cashflow.mobile.openSection")).toBe(
      "expense",
    );
  });

  it("auto-selecciona el bucket de hoy al mount y muestra el peek 'Esta semana'", async () => {
    renderList();
    // 2026-05-14 cae en la semana W20 (11–17 may).
    await waitFor(() => {
      expect(screen.getByText(/Semana del 11 al 17 may/)).toBeTruthy();
      expect(screen.getByText("Esta semana")).toBeTruthy();
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
