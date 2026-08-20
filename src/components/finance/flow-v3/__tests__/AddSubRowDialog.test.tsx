/**
 * Subfilas: selector crear / editar / eliminar (mismo patrón que egreso recurrente).
 */
import { describe, it, expect, vi, beforeEach } from "vitest";
import { fireEvent, render, screen, waitFor } from "@testing-library/react";
import { AddSubRowDialog } from "../AddSubRowDialog";
import type { FlowMatrixRowDto } from "@/modules/finance/flow-v3/matrix-types";

const parent = {
  id: "parent-1",
  name: "Sin clasificar",
  section: "GAV",
  mapping: "MANUAL",
  isArchived: false,
  isVirtual: false,
  cells: [],
} as unknown as FlowMatrixRowDto;

const child = {
  id: "child-1",
  name: "Uniformes y EPP",
  section: "GAV",
  mapping: "MANUAL",
  parentId: "parent-1",
  isArchived: false,
  isVirtual: false,
  cells: [{
    weekStart: "2026-08-10",
    plan: 646_660,
    committed: null,
    real: null,
    effective: -646_660,
    layer: "plan",
  }],
} as unknown as FlowMatrixRowDto;

const existingRule = {
  id: "rec-1",
  rowId: "child-1",
  amount: 646_660,
  currency: "CLP" as const,
  amountMode: "FIXED" as const,
  pctSales: null,
  amountUf: null,
  ufPolicy: null,
  ufCustomDay: null,
  frequency: "MONTHLY",
  dayOfMonth: 1,
  startDate: "2026-08-01",
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

describe("AddSubRowDialog — listar / editar / eliminar", () => {
  it("abre en alta con Crear subfila y sin Eliminar", () => {
    render(
      <AddSubRowDialog
        parent={parent}
        children={[child]}
        busy={false}
        onConfirm={async () => null}
        onUpdate={async () => ({})}
        onDelete={async () => ({})}
        onClose={() => {}}
      />,
    );
    expect(screen.getByRole("button", { name: "Crear subfila" })).toBeTruthy();
    expect(screen.queryByRole("button", { name: "Eliminar" })).toBeNull();
    expect(screen.getByTestId("subrow-selector")).toBeTruthy();
  });

  it("al elegir una hija existente carga el formulario y permite guardar/eliminar", async () => {
    render(
      <AddSubRowDialog
        parent={parent}
        children={[child]}
        initialChildId={child.id}
        busy={false}
        onConfirm={async () => null}
        onUpdate={async () => ({})}
        onDelete={async () => ({})}
        onClose={() => {}}
      />,
    );

    await waitFor(() => {
      expect(screen.getByRole("button", { name: "Guardar cambios" })).toBeTruthy();
    });
    expect(screen.getByRole("button", { name: "Eliminar" })).toBeTruthy();
    const name = screen.getByPlaceholderText("Ej. Contador") as HTMLInputElement;
    expect(name.value).toBe("Uniformes y EPP");
  });

  it("confirma y elimina la subfila seleccionada", async () => {
    const onDelete = vi.fn(async () => ({ ok: true }));
    const onClose = vi.fn();
    render(
      <AddSubRowDialog
        parent={parent}
        children={[child]}
        initialChildId={child.id}
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
    expect(screen.getByText(/¿Eliminar esta subfila/)).toBeTruthy();
    fireEvent.click(screen.getByRole("button", { name: "Sí, eliminar" }));
    await waitFor(() => {
      expect(onDelete).toHaveBeenCalledWith("child-1");
      expect(onClose).toHaveBeenCalled();
    });
  });
});
