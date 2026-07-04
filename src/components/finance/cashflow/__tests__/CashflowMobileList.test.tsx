import { describe, it, expect, beforeEach, afterEach, vi } from "vitest";
import { render, screen, fireEvent, waitFor } from "@testing-library/react";
import { CashflowMobileList } from "../CashflowMobileList";
import { makeMobileProjection } from "./fixtures/cashflow-mobile-fixture";

vi.mock("next/navigation", () => ({
  useRouter: () => ({ refresh: vi.fn(), push: vi.fn() }),
}));

const fetchMock = vi.fn();

beforeEach(() => {
  vi.stubGlobal("fetch", fetchMock);
  fetchMock.mockReset();
  // Default: el fetch de proyección mensual devuelve el mismo fixture
  // (hydrateProjection convierte los start/end string a Date).
  fetchMock.mockImplementation(async (url: string) => ({
    json: async () =>
      typeof url === "string" && url.includes("/projection")
        ? { success: true, data: makeMobileProjection() }
        : { success: true, data: null },
  }));
  if (typeof window !== "undefined") {
    window.localStorage.clear();
  }
});

afterEach(() => {
  vi.useRealTimers();
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

/** Cambia al modo mensual (acordeón Ingresos/Egresos) y espera el render. */
async function switchToMonthly() {
  fireEvent.click(screen.getByRole("button", { name: /Mensual/ }));
  await waitFor(() => {
    expect(screen.getByRole("button", { name: /Ingresos/ })).toBeTruthy();
  });
}

describe("CashflowMobileList", () => {
  it("weekly por default: segmented + tabla semanal con bandas INGRESOS/EGRESOS", () => {
    renderList();
    expect(screen.getByRole("button", { name: /Mensual/ })).toBeTruthy();
    expect(screen.getByRole("button", { name: /Semanal/ })).toBeTruthy();
    expect(screen.getByText("INGRESOS")).toBeTruthy();
    expect(screen.getByText("EGRESOS")).toBeTruthy();
    // Las categorías aparecen como bandas (colapsadas por default).
    expect(screen.getByText("Ventas")).toBeTruthy();
    expect(screen.getByText("Sueldos")).toBeTruthy();
  });

  it("cambiar de semana con el navegador: retroceder hasta la primera deshabilita 'anterior'", async () => {
    renderList();
    // Activo al mount = W20 (último bucket; hoy queda fuera del rango del
    // fixture y el componente cae al último). W19 es el primero.
    const prevBtn = screen.getByRole("button", { name: /Semana anterior/ });
    expect(prevBtn.hasAttribute("disabled")).toBe(false);
    fireEvent.click(prevBtn);
    await waitFor(() => {
      expect(prevBtn.hasAttribute("disabled")).toBe(true);
    });
  });

  it("mensual: las categorías de Ingresos están expandidas por default — ítems visibles", async () => {
    renderList();
    await switchToMonthly();
    // Sin tap en la categoría, el ítem ya está visible (agrupado por cliente).
    await waitFor(() => {
      expect(screen.getByText("Cliente Uno")).toBeTruthy();
      expect(screen.getByText("Edificio A")).toBeTruthy();
    });
  });

  it("mensual: tap en un ítem abre el drawer", async () => {
    renderList();
    await switchToMonthly();
    fireEvent.click(await screen.findByText("Edificio A"));
    await waitFor(() => {
      expect(screen.getByText(/Monto del período/i)).toBeTruthy();
    });
  });

  it("switch semanal→mensual dispara fetch con granularity=monthly", async () => {
    renderList();
    fireEvent.click(screen.getByRole("button", { name: /Mensual/ }));
    await waitFor(() => {
      expect(fetchMock).toHaveBeenCalledWith(
        expect.stringContaining("granularity=monthly"),
      );
    });
  });

  it("persistencia: colapsar una categoría se guarda en localStorage", async () => {
    renderList();
    await switchToMonthly();
    // Default = expandido → el primer click colapsa y persiste "0".
    fireEvent.click(await screen.findByRole("button", { name: /Ventas/ }));
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

  it("oculta acciones del drawer cuando canManage=false", async () => {
    renderList(false);
    await switchToMonthly();
    fireEvent.click(await screen.findByText("Edificio A"));
    await waitFor(() => {
      expect(screen.getByText(/Monto del período/i)).toBeTruthy();
    });
    expect(screen.queryByText(/Mover a otro período/i)).toBeNull();
    expect(screen.queryByText(/Editar monto/i)).toBeNull();
  });

  it("mensual: muestra empty state cuando la sección no tiene movimientos", async () => {
    const noExpenses = () => {
      const p = makeMobileProjection();
      p.rows = p.rows.filter((r) => r.kind !== "EXPENSE");
      return p;
    };
    fetchMock.mockImplementation(async (url: string) => ({
      json: async () =>
        typeof url === "string" && url.includes("/projection")
          ? { success: true, data: noExpenses() }
          : { success: true, data: null },
    }));
    render(
      <CashflowMobileList
        initialProjection={noExpenses()}
        defaultWeeks={8}
        defaultMonths={6}
        canManage
      />,
    );
    await switchToMonthly();
    // Por default, Ingresos está abierto y Egresos cerrado: hay que abrir Egresos.
    const egresosHeader = screen.getByRole("button", { name: /Egresos/ });
    expect(egresosHeader.getAttribute("aria-expanded")).toBe("false");
    fireEvent.click(egresosHeader);
    await waitFor(() => {
      expect(screen.getByText(/Sin egresos proyectados/i)).toBeTruthy();
    });
  });

  it("acordeón mensual: abrir Egresos cierra Ingresos y persiste la sección", async () => {
    renderList();
    await switchToMonthly();
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
    // El fixture cubre W19–W20 de mayo 2026; fijamos "hoy" dentro de W20
    // para que el peek aparezca sin depender de la fecha real del sistema.
    vi.useFakeTimers({ shouldAdvanceTime: true });
    vi.setSystemTime(new Date("2026-05-14T12:00:00"));
    renderList();
    await waitFor(() => {
      expect(screen.getByText(/Esta semana/)).toBeTruthy();
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
