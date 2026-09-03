/** @vitest-environment jsdom */
import { describe, it, expect, beforeEach, vi } from "vitest";
import { render, screen, waitFor, fireEvent } from "@testing-library/react";
import { ResultadoClient } from "../ResultadoClient";
import type { ProjectedPnlResult } from "@/modules/finance/flow-v3/projected-pnl";

vi.mock("next/navigation", () => ({
  useRouter: () => ({ push: vi.fn(), refresh: vi.fn() }),
  usePathname: () => "/finanzas/flujo-caja/resultado",
}));

const PAYLOAD: ProjectedPnlResult = {
  months: [
    { key: "2026-07", label: "Jul 2026", isCurrent: true, isPast: false },
    { key: "2026-08", label: "Ago 2026", isCurrent: false, isPast: false },
  ],
  company: {
    revenue: [100, 200],
    personnel: [50, 50],
    extraShifts: [0, 0],
    directCost: [0, 10],
    gav: [5, 5],
    result: [45, 135],
    totals: {
      revenue: 300,
      personnel: 100,
      extraShifts: 0,
      directCost: 10,
      gav: 10,
      result: 180,
      marginPct: 60,
    },
  },
  installations: [
    {
      installationId: "inst-1",
      name: "Angloamerican",
      totals: {
        revenue: 300,
        personnel: 100,
        extraShifts: 0,
        directCost: 10,
        gav: 10,
        result: 180,
        marginPct: 60,
      },
      monthly: {
        revenue: [100, 200],
        personnel: [50, 50],
        extraShifts: [0, 0],
        directCost: [0, 10],
        gav: [5, 5],
        result: [45, 135],
      },
    },
  ],
  unassigned: null,
  allocationMethod: "by_revenue",
};

beforeEach(() => {
  vi.stubGlobal(
    "fetch",
    vi.fn().mockResolvedValue({
      ok: true,
      json: async () => ({ success: true, data: PAYLOAD }),
    }),
  );
});

describe("ResultadoClient", () => {
  it("usa Compras de faena y no mezcla personal bajo Costo directo", async () => {
    render(<ResultadoClient />);
    await waitFor(() => {
      expect(screen.getAllByText("Compras de faena").length).toBeGreaterThan(0);
    });
    expect(screen.queryByText("Costo directo")).toBeNull();
    expect(screen.queryByText("Costos directos")).toBeNull();
    expect(screen.getAllByText(/netos de IVA/).length).toBeGreaterThan(0);
    expect(screen.getAllByText(/equipo interno/).length).toBeGreaterThan(0);
    expect(screen.getByText(/promedio de los últimos 3 meses/)).toBeTruthy();
    expect(screen.getByText(/retiros de socios/)).toBeTruthy();
    expect(screen.getByText(/factoring/)).toBeTruthy();
    expect(screen.getByText(/provisiones de vacaciones/)).toBeTruthy();
    expect(screen.queryByText(/Sin provisiones ni sueldos administrativos/)).toBeNull();
  });

  it("abre un concepto y muestra las faenas que lo componen", async () => {
    render(<ResultadoClient />);
    await waitFor(() => {
      expect(screen.getAllByText("Compras de faena").length).toBeGreaterThan(0);
    });
    const toggle = screen.getAllByRole("button", { name: /Compras de faena/ })[0];
    fireEvent.click(toggle);
    await waitFor(() => {
      expect(screen.getAllByText("Angloamerican").length).toBeGreaterThan(0);
    });
  });

  it("en el ranking separa Personal y Compras de faena", async () => {
    render(<ResultadoClient />);
    await waitFor(() => {
      expect(screen.getByRole("tab", { name: /Por instalación/ })).toBeTruthy();
    });
    fireEvent.click(screen.getByRole("tab", { name: /Por instalación/ }));
    await waitFor(() => {
      expect(screen.getByText("Elegí una faena para ver el mes a mes", { exact: false })).toBeTruthy();
    });
    expect(screen.getByText("Personal")).toBeTruthy();
    expect(screen.getAllByText("Compras de faena").length).toBeGreaterThan(0);
    expect(screen.queryByText("Costo directo")).toBeNull();
    expect(screen.getByText("GAV prorrateado por ingresos")).toBeTruthy();
  });
});
