import { describe, it, expect, vi } from "vitest";
import {
  buildCellMenu,
  buildCellSheetModel,
  type CellMenuCallbacks,
  type CellMenuContext,
} from "../menu-builders";
import type { FlowMatrixCellDto, FlowMatrixRowDto } from "@/modules/finance/flow-v3/matrix-types";

function row(partial?: Partial<FlowMatrixRowDto>): FlowMatrixRowDto {
  return {
    id: "r1",
    name: "Berlintexx",
    section: "INGRESOS",
    mapping: "ACCOUNT_INSTALLATION",
    orderIndex: 0,
    crmAccountId: "acc",
    installationId: null,
    categoryId: null,
    supplierId: null,
    isArchived: false,
    archivedWeekCutoff: null,
    isVirtual: false,
    cells: [],
    ...partial,
  };
}

function cellWithDtes(n: number): FlowMatrixCellDto {
  const items = Array.from({ length: n }, (_, i) => ({
    kind: "dte" as const,
    dteId: `dte-${i + 1}`,
    folio: 1000 + i,
    label: i === 0 ? "Berlintexx" : "Otro receptor",
    fecha: "2026-07-01",
    monto: 100_000 * (i + 1),
    overdueDays: i === 0 ? 40 : 0,
  }));
  return {
    weekStart: "2026-08-03",
    plan: 0,
    committed: { total: items.reduce((s, x) => s + x.monto, 0), items },
    real: null,
    effective: items.reduce((s, x) => s + x.monto, 0),
    layer: "committed",
  };
}

const weeks = [
  { key: "2026-08-10", weekStart: "2026-08-10", label: "S33", isCurrent: false, isPast: false, isFuture: true },
  { key: "2026-08-17", weekStart: "2026-08-17", label: "S34", isCurrent: false, isPast: false, isFuture: true },
];

const ctx: CellMenuContext = {
  editable: false,
  reason: "Ingreso facturado (la factura manda)",
  openWeeks: [],
  dteMoveWeeks: weeks,
  canManage: true,
  rowName: "Berlintexx",
};

function cbs(): CellMenuCallbacks {
  return {
    onEditAmount: vi.fn(),
    onFillRight: vi.fn(),
    onClearPlan: vi.fn(),
    onMovePlan: vi.fn(),
    onMoveDte: vi.fn(),
    onViewDetail: vi.fn(),
    onViewDte: vi.fn(),
    onExcludeDte: vi.fn(),
    onRegisterPayment: vi.fn(),
  };
}

describe("buildCellSheetModel — grupos por folio", () => {
  it("ordena vencidas primero y arma cabecera + acciones", () => {
    const model = buildCellSheetModel(row(), cellWithDtes(2), ctx, cbs());
    expect(model.folioGroups).toHaveLength(2);
    expect(model.folioGroups[0]!.header.folioLabel).toBe("F°1000");
    expect(model.folioGroups[0]!.header.overdueDays).toBe(40);
    expect(model.folioGroups[0]!.header.status).toBe("Vencida");
    expect(model.folioGroups[1]!.header.receiver).toBe("Otro receptor");
    const keys = model.folioGroups[0]!.items.map((i) => i.key);
    expect(keys.some((k) => k.startsWith("move-dte-"))).toBe(true);
    expect(keys.some((k) => k.startsWith("view-dte-"))).toBe(true);
    expect(keys.some((k) => k.startsWith("exclude-"))).toBe(true);
    expect(keys.some((k) => k.startsWith("pay-"))).toBe(true);
    expect(model.commonItems.some((i) => i.key === "detail")).toBe(true);
  });
});

describe("buildCellMenu — por folio en desktop", () => {
  it("con 2+ DTEs expone Ver/Excluir/Pago como submenús", () => {
    const items = buildCellMenu(row(), cellWithDtes(2), ctx, cbs());
    expect(items.find((i) => i.key === "view-dte")?.submenu?.length).toBe(2);
    expect(items.find((i) => i.key === "exclude-dte")?.submenu?.length).toBe(2);
    expect(items.find((i) => i.key === "pay-dte")?.submenu?.length).toBe(2);
    expect(items.find((i) => i.key === "move-dte")?.submenu?.length).toBe(2);
  });

  it("con 1 DTE acciones planas por folio", () => {
    const items = buildCellMenu(row(), cellWithDtes(1), ctx, cbs());
    expect(items.some((i) => i.key.startsWith("view-dte-"))).toBe(true);
    expect(items.some((i) => i.key.startsWith("pay-"))).toBe(true);
    expect(items.find((i) => i.key === "view-dte")).toBeUndefined();
  });
});
