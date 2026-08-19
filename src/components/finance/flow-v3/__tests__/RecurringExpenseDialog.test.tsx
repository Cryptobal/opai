/**
 * Recurrencias de plan: al abrir el diálogo se listan las existentes
 * y se puede editar o eliminar (futuras no selladas).
 */
import { describe, it, expect, vi, beforeEach } from "vitest";
import { fireEvent, render, screen, waitFor } from "@testing-library/react";
import { RecurringExpenseDialog } from "../RecurringExpenseDialog";
import type { FlowMatrixRowDto } from "@/modules/finance/flow-v3/matrix-types";

const row = {
  id: "row-1",
  name: "Arriendo oficina",
  section: "GAV",
  isArchived: false,
  cells: [],
} as unknown as FlowMatrixRowDto;

const existingRule = {
  id: "rec-1",
  rowId: "row-1",
  amount: 1_500_000,
  currency: "CLP" as const,
  amountMode: "FIXED" as const,
  pctSales: null,
  amountUf: null,
  ufPolicy: null,
  ufCustomDay: null,
  frequency: "MONTHLY",
  dayOfMonth: 5,
  startDate: "2026-07-05",
  endDate: null,
  endAfterOccurrences: null,
  note: null,
};

beforeEach(() => {
  vi.stubGlobal(
    "fetch",
    vi.fn(async (url: string) => {
      if (String(url).includes("/recurring-plan?rowId=")) {
        return { json: async () => ({ success: true, data: [existingRule] }) };
      }
      return { json: async () => ({ success: true, data: [] }) };
    }),
  );
});

describe("RecurringExpenseDialog — listar / editar / eliminar", () => {
  it("carga las recurrencias de la fila y prellena el formulario", async () => {
    render(
      <RecurringExpenseDialog
        row={row}
        busy={false}
        onConfirm={async () => null}
        onUpdate={async () => ({})}
        onDelete={async () => ({})}
        onClose={() => {}}
      />,
    );

    await waitFor(() => {
      expect(screen.getByText(/Mensual · .* · desde 05\/07/)).toBeTruthy();
    });
    expect(screen.getByRole("button", { name: "Guardar cambios" })).toBeTruthy();
    expect(screen.getByRole("button", { name: "Eliminar" })).toBeTruthy();
    const amount = screen.getByPlaceholderText("1.500.000") as HTMLInputElement;
    expect(amount.value.replace(/\./g, "")).toContain("1500000");
  });

  it("permite crear nueva sin tocar las existentes", async () => {
    render(
      <RecurringExpenseDialog
        row={row}
        busy={false}
        onConfirm={async () => ({})}
        onUpdate={async () => ({})}
        onDelete={async () => ({})}
        onClose={() => {}}
      />,
    );

    await waitFor(() => {
      expect(screen.getByRole("button", { name: "Guardar cambios" })).toBeTruthy();
    });

    fireEvent.change(screen.getByTestId("recurrence-selector"), {
      target: { value: "__new__" },
    });

    await waitFor(() => {
      expect(screen.getByRole("button", { name: "Crear recurrente" })).toBeTruthy();
    });
    expect(screen.queryByRole("button", { name: "Eliminar" })).toBeNull();
  });

  it("confirma y elimina la recurrencia seleccionada", async () => {
    const onDelete = vi.fn(async () => ({ deleted: true }));
    const onClose = vi.fn();
    render(
      <RecurringExpenseDialog
        row={row}
        busy={false}
        onConfirm={async () => null}
        onUpdate={async () => ({})}
        onDelete={onDelete}
        onClose={onClose}
      />,
    );

    await waitFor(() => {
      expect(screen.getByRole("button", { name: "Eliminar" })).toBeTruthy();
    });
    fireEvent.click(screen.getByRole("button", { name: "Eliminar" }));
    expect(screen.getByText(/¿Eliminar esta recurrencia/)).toBeTruthy();
    fireEvent.click(screen.getByRole("button", { name: "Sí, eliminar" }));
    await waitFor(() => {
      expect(onDelete).toHaveBeenCalledWith("rec-1");
      expect(onClose).toHaveBeenCalled();
    });
  });
});
