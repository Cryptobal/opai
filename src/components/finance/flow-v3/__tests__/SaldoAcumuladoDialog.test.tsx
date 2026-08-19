/** @vitest-environment jsdom */
import { describe, it, expect, vi } from "vitest";
import { render, screen, fireEvent } from "@testing-library/react";
import { SaldoAcumuladoDialog } from "../SaldoAcumuladoDialog";

describe("SaldoAcumuladoDialog", () => {
  it("muestra desglose de saldo acumulado (banco hoy + pendientes)", () => {
    render(
      <SaldoAcumuladoDialog
        open
        onOpenChange={() => {}}
        payload={{
          kind: "current",
          weekKey: "2026-08-03",
          balance: 14_631_828,
          bankToday: 9_974_162,
          breakdown: {
            pendingIncome: 12_880_404,
            pendingExpense: 8_222_738,
            pendingNet: 4_657_666,
          },
        }}
      />,
    );
    expect(screen.getByRole("heading", { name: /Saldo acumulado/ })).toBeTruthy();
    expect(screen.getByText("Banco hoy")).toBeTruthy();
    expect(screen.getByText("Ingresos pendientes")).toBeTruthy();
    expect(screen.getByText("Egresos pendientes")).toBeTruthy();
    expect(screen.getAllByText(/14\.631\.828|\$14\.631\.828/).length).toBeGreaterThan(0);
  });

  it("muestra inconsistencia entre sellos sin copy de descuadre vs cierre", () => {
    const onOpenChange = vi.fn();
    render(
      <SaldoAcumuladoDialog
        open
        onOpenChange={onOpenChange}
        payload={{
          kind: "seal-break",
          weekKey: "2026-07-13",
          balance: 28_455_846,
          vsWeek: "2026-07-06",
          delta: -1_200_000,
        }}
      />,
    );
    expect(screen.getByText(/Sellos inconsistentes/)).toBeTruthy();
    expect(screen.queryByText(/Descuadre no conciliado/i)).toBeNull();
    fireEvent.click(screen.getByRole("button", { name: "Entendido" }));
    expect(onOpenChange).toHaveBeenCalledWith(false);
  });
});
