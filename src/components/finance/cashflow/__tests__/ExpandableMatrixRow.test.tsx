import { describe, it, expect, beforeEach, vi } from "vitest";
import { render, screen, fireEvent } from "@testing-library/react";
import { DndContext } from "@dnd-kit/core";
import type {
  ProjectionRow,
  ProjectionBucket,
} from "@/modules/finance/cashflow/types";
import { ExpandableMatrixRow } from "../ExpandableMatrixRow";

function makeBuckets(): ProjectionBucket[] {
  return [
    {
      key: "2026-W19",
      label: "Sem 19",
      start: new Date("2026-05-04"),
      end: new Date("2026-05-10"),
      income: 0,
      expense: 0,
      net: 0,
      actualIncome: 0,
      actualExpense: 0,
      varianceClp: 0,
      occurrences: [],
    },
    {
      key: "2026-W20",
      label: "Sem 20",
      start: new Date("2026-05-11"),
      end: new Date("2026-05-17"),
      income: 0,
      expense: 0,
      net: 0,
      actualIncome: 0,
      actualExpense: 0,
      varianceClp: 0,
      occurrences: [],
    },
  ];
}

function makeRow(items: number = 2): ProjectionRow {
  return {
    categoryId: "cat-ventas",
    categoryCode: "ING_VENTA_CONTRATO",
    categoryName: "Ventas contrato",
    kind: "INCOME",
    values: [
      { bucketKey: "2026-W19", amount: 1_000_000 },
      { bucketKey: "2026-W20", amount: 1_500_000 },
    ],
    total: 2_500_000,
    items: Array.from({ length: items }, (_, i) => ({
      itemId: `item-${i + 1}`,
      itemName: `Item ${i + 1}`,
      installationId: `inst-${i + 1}`,
      installationName: `Edificio ${String.fromCharCode(65 + i)}`,
      source: "CONTRACT" as const,
      sourceRefCode: null,
      values: [
        {
          bucketKey: "2026-W19",
          amount: 500_000,
          actualAmount: null,
          occurrenceId: `occ-${i + 1}-w19`,
        },
        {
          bucketKey: "2026-W20",
          amount: 750_000,
          actualAmount: null,
          occurrenceId: `occ-${i + 1}-w20`,
        },
      ],
      total: 1_250_000,
      totalActual: 0,
    })),
  };
}

function renderRow(row: ProjectionRow, buckets = makeBuckets()) {
  return render(
    <DndContext>
      <table>
        <tbody>
          <ExpandableMatrixRow
            row={row}
            buckets={buckets}
            granularity="weekly"
            onActionDone={() => {}}
          />
        </tbody>
      </table>
    </DndContext>,
  );
}

beforeEach(() => {
  // localStorage limpio entre tests.
  if (typeof window !== "undefined") {
    window.localStorage.clear();
  }
  vi.clearAllMocks();
});

describe("ExpandableMatrixRow", () => {
  it("colapsado por default: no muestra sub-filas", () => {
    renderRow(makeRow(2));
    expect(screen.getByText("Ventas contrato")).toBeTruthy();
    // Las sub-filas no se muestran.
    expect(screen.queryByText("Edificio A")).toBeNull();
    expect(screen.queryByText("Edificio B")).toBeNull();
  });

  it("muestra el contador de items en la fila colapsada", () => {
    renderRow(makeRow(3));
    expect(screen.getByText("(3)")).toBeTruthy();
  });

  it("click en chevron expande y muestra una sub-fila por item", () => {
    renderRow(makeRow(2));
    const toggleButton = screen.getByRole("button", { name: /Ventas contrato/i });
    fireEvent.click(toggleButton);
    expect(screen.getByText("Edificio A")).toBeTruthy();
    expect(screen.getByText("Edificio B")).toBeTruthy();
  });

  it("segundo click colapsa de nuevo", () => {
    renderRow(makeRow(2));
    const toggleButton = screen.getByRole("button", { name: /Ventas contrato/i });
    fireEvent.click(toggleButton);
    expect(screen.getByText("Edificio A")).toBeTruthy();
    fireEvent.click(toggleButton);
    expect(screen.queryByText("Edificio A")).toBeNull();
  });

  it("estado expandido persiste en localStorage por categoryId", () => {
    const { unmount } = renderRow(makeRow(2));
    fireEvent.click(screen.getByRole("button", { name: /Ventas contrato/i }));
    expect(window.localStorage.getItem("cashflow.expanded.cat-ventas")).toBe("1");
    unmount();
    // Re-render → debe arrancar expandido.
    renderRow(makeRow(2));
    expect(screen.getByText("Edificio A")).toBeTruthy();
  });

  it("desactiva el chevron cuando la categoría no tiene items", () => {
    const empty: ProjectionRow = {
      ...makeRow(0),
      items: [],
    };
    renderRow(empty);
    const btn = screen.getByRole("button", { name: /Ventas contrato/i });
    expect(btn.hasAttribute("disabled")).toBe(true);
  });

  it("usa installationName cuando está disponible y itemName como fallback", () => {
    const row = makeRow(1);
    row.items[0].installationName = null;
    row.items[0].itemName = "Item Sin Instalación";
    renderRow(row);
    fireEvent.click(screen.getByRole("button", { name: /Ventas contrato/i }));
    expect(screen.getByText("Item Sin Instalación")).toBeTruthy();
  });
});
