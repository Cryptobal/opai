import { describe, it, expect, vi } from "vitest";
import {
  buildRowMenu,
  rowDeleteBlockReason,
  type RowMenuCallbacks,
} from "../menu-builders";
import type { FlowMatrixRowDto } from "@/modules/finance/flow-v3/matrix-types";

function row(partial?: Partial<FlowMatrixRowDto>): FlowMatrixRowDto {
  return {
    id: "r1",
    name: "Arriendo oficina",
    section: "GAV",
    mapping: "MANUAL",
    orderIndex: 0,
    crmAccountId: null,
    installationId: null,
    categoryId: null,
    supplierId: null,
    isArchived: false,
    archivedWeekCutoff: null,
    isVirtual: false,
    parentId: null,
    cells: [],
    ...partial,
  };
}

function cbs(overrides?: Partial<RowMenuCallbacks>): RowMenuCallbacks {
  return {
    onRename: vi.fn(),
    onRestoreName: vi.fn(),
    onChangeSection: vi.fn(),
    onChangeAccounts: vi.fn(),
    onDeferTerm: vi.fn(),
    onSetDiasCobro: vi.fn(),
    onRecurring: vi.fn(),
    onAddSubRow: vi.fn(),
    onEditSubRow: vi.fn(),
    onArchive: vi.fn(),
    onUnarchive: vi.fn(),
    onDelete: vi.fn(),
    ...overrides,
  };
}

const planCell = {
  weekStart: "2026-08-10",
  plan: 646_660,
  committed: null,
  real: null,
  effective: -646_660,
  layer: "plan" as const,
};

describe("rowDeleteBlockReason", () => {
  it("subfila con solo plan no bloquea", () => {
    expect(rowDeleteBlockReason(row({ parentId: "p1", cells: [planCell] }))).toBeNull();
  });

  it("padre con plan sí bloquea", () => {
    expect(rowDeleteBlockReason(row({ cells: [planCell] }))).toMatch(/plan histórico/i);
  });

  it("real o comprometido bloquea padre e hijo", () => {
    const withReal = row({
      parentId: "p1",
      cells: [{
        ...planCell,
        real: { total: 100_000, items: [] },
        layer: "real",
      }],
    });
    expect(rowDeleteBlockReason(withReal)).toMatch(/real o comprometido/i);
  });
});

describe("buildRowMenu — subfilas", () => {
  it("padre GAV muestra Agregar subfila, no Editar", () => {
    const items = buildRowMenu(row(), [], cbs());
    expect(items.some((i) => i.key === "add-subrow" && i.label === "Agregar subfila…")).toBe(true);
    expect(items.some((i) => i.key === "edit-subrow")).toBe(false);
  });

  it("padre Impuestos (T.G.R.) admite subfila", () => {
    const items = buildRowMenu(row({ name: "T.G.R.", section: "IMPUESTOS" }), [], cbs());
    expect(items.some((i) => i.key === "add-subrow" && i.label === "Agregar subfila…")).toBe(true);
  });

  it("hijo muestra Editar subfila, no Agregar", () => {
    const items = buildRowMenu(row({ id: "c1", parentId: "p1", name: "Uniformes" }), [], cbs());
    expect(items.some((i) => i.key === "add-subrow")).toBe(false);
    expect(items.some((i) => i.key === "edit-subrow" && i.label === "Editar subfila…")).toBe(true);
  });

  it("hijo con solo plan habilita Eliminar", () => {
    const items = buildRowMenu(
      row({ parentId: "p1", cells: [planCell] }),
      [],
      cbs(),
    );
    const del = items.find((i) => i.key === "delete");
    expect(del?.disabled).toBeFalsy();
    expect(del?.onSelect).toBeTypeOf("function");
  });

  it("hijo con real deshabilita Eliminar", () => {
    const items = buildRowMenu(
      row({
        parentId: "p1",
        cells: [{
          ...planCell,
          real: { total: 50_000, items: [] },
          layer: "real",
        }],
      }),
      [],
      cbs(),
    );
    const del = items.find((i) => i.key === "delete");
    expect(del?.disabled).toBe(true);
    expect(del?.reason).toMatch(/real o comprometido/i);
  });
});

describe("buildRowMenu — archivar", () => {
  it("fila archivada ofrece Desarchivar", () => {
    const items = buildRowMenu(row({ isArchived: true }), [], cbs());
    expect(items.find((i) => i.key === "unarchive")?.label).toBe("Desarchivar fila");
    expect(items.find((i) => i.key === "archive")).toBeUndefined();
  });
});
