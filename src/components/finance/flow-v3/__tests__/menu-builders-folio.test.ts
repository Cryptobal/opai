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
    emissionYmd: "2026-06-01",
    dueYmd: i === 0 ? "2026-06-25" : "2026-08-01",
  }));
  return {
    weekStart: "2026-08-03",
    plan: 500_000,
    committed: { total: items.reduce((s, x) => s + x.monto, 0), items },
    real: null,
    effective: items.reduce((s, x) => s + x.monto, 0),
    layer: "committed",
  };
}

const weeks = [
  { key: "2026-06-22", weekStart: "2026-06-22", label: "S26", isCurrent: false, isPast: true, weekCount: 1, monthKey: "2026-06" },
  { key: "2026-08-10", weekStart: "2026-08-10", label: "S33", isCurrent: false, isPast: false, weekCount: 1, monthKey: "2026-08" },
  { key: "2026-08-17", weekStart: "2026-08-17", label: "S34", isCurrent: false, isPast: false, weekCount: 1, monthKey: "2026-08" },
];

const ctx: CellMenuContext = {
  editable: false,
  reason: "Ingreso facturado (la factura manda)",
  openWeeks: [],
  dteMoveWeeks: weeks,
  canManage: true,
  rowName: "Berlintexx",
  currentWeek: "2026-08-03",
  cellWeekStart: "2026-08-03",
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
  it("ordena vencidas primero y arma cabecera v4.6 + acciones", () => {
    const model = buildCellSheetModel(row(), cellWithDtes(2), ctx, cbs());
    expect(model.folioGroups).toHaveLength(2);
    expect(model.folioGroups[0]!.header.titleLine).toContain("F°1000");
    expect(model.folioGroups[0]!.header.titleLine).toContain("Berlintexx");
    expect(model.folioGroups[0]!.header.statusLine).toContain("Emitida");
    expect(model.folioGroups[0]!.header.statusLine).toContain("vencida hace 40 d");
    expect(model.folioGroups[1]!.header.statusLine).toContain("Pendiente");
    const keys = model.folioGroups[0]!.items.map((i) => i.key);
    expect(keys.some((k) => k.startsWith("move-dte-"))).toBe(true);
    expect(keys.some((k) => k.startsWith("view-dte-"))).toBe(true);
    expect(keys.some((k) => k.startsWith("exclude-"))).toBe(true);
    expect(keys.some((k) => k.startsWith("pay-"))).toBe(true);
    expect(model.commonItems.some((i) => i.key === "detail")).toBe(true);
    expect(model.commonItems.some((i) => i.key === "edit")).toBe(false);
  });
});

describe("buildCellMenu — por folio en desktop", () => {
  it("con 2+ DTEs no muestra acciones de plan y expone submenús por folio", () => {
    const items = buildCellMenu(row(), cellWithDtes(2), ctx, cbs());
    expect(items.find((i) => i.key === "edit")).toBeUndefined();
    expect(items.find((i) => i.key === "view-dte")?.submenu?.length).toBe(2);
    expect(items.find((i) => i.key === "exclude-dte")?.submenu?.length).toBe(2);
    expect(items.find((i) => i.key === "pay-dte")?.submenu?.length).toBe(2);
    expect(items.find((i) => i.key === "move-dte")?.submenu?.length).toBe(2);
    const moveSub = items.find((i) => i.key === "move-dte")?.submenu?.[0]?.submenu ?? [];
    expect(moveSub.some((i) => String(i.label).includes("HACIA ATRÁS"))).toBe(true);
    expect(moveSub.some((i) => String(i.label).includes("HACIA ADELANTE"))).toBe(true);
  });

  it("con 1 DTE acciones planas por folio sin plan", () => {
    const items = buildCellMenu(row(), cellWithDtes(1), ctx, cbs());
    expect(items.some((i) => i.key.startsWith("view-dte-"))).toBe(true);
    expect(items.some((i) => i.key.startsWith("pay-"))).toBe(true);
    expect(items.find((i) => i.key === "view-dte")).toBeUndefined();
    expect(items.find((i) => i.key === "edit")).toBeUndefined();
  });

  it("celda solo plan usa etiquetas humanas", () => {
    const planCell: FlowMatrixCellDto = {
      weekStart: "2026-08-03",
      plan: 100_000,
      committed: null,
      real: null,
      effective: 100_000,
      layer: "plan",
    };
    const planCtx = { ...ctx, editable: true, reason: "" };
    const items = buildCellMenu(row(), planCell, planCtx, cbs());
    expect(items.find((i) => i.key === "edit")?.label).toBe("Editar monto");
    expect(items.find((i) => i.key === "fill")?.label).toBe("Copiar a las semanas siguientes…");
    expect(items.find((i) => i.key === "move")?.label).toBe("Mover a otra semana");
    expect(items.find((i) => i.key === "clear")?.label).toBe("Quitar de esta semana");
  });

  it("borrador con EP ofrece Mover a otra semana y Ver borrador", () => {
    const draftCell: FlowMatrixCellDto = {
      weekStart: "2026-08-03",
      plan: 0,
      committed: {
        total: 500_000,
        items: [{
          kind: "draft",
          dteId: "draft-ep",
          label: "Transmat",
          fecha: "2026-08-04",
          monto: 500_000,
          issueYmd: "2026-08-04",
          terminoDias: 3,
          cobroEstYmd: "2026-08-07",
          sentDocs: { proforma: false, estadoPago: true },
        }],
      },
      real: null,
      effective: 500_000,
      layer: "committed",
    };
    const items = buildCellMenu(row({ name: "Transmat 20%" }), draftCell, ctx, cbs());
    expect(items.find((i) => i.key === "edit")).toBeUndefined();
    expect(items.find((i) => i.key === "move-draft-draft-ep")?.label).toBe("Mover a otra semana");
    expect(items.find((i) => i.key === "view-draft-draft-ep")?.label).toBe("Ver borrador");
    const moveSub = items.find((i) => i.key === "move-draft-draft-ep")?.submenu ?? [];
    expect(moveSub.some((i) => String(i.label).includes("HACIA ATRÁS"))).toBe(true);
  });
});

describe("buildCellSheetModel — grupos borrador", () => {
  it("etiqueta fiel EP + línea fecha doc / término", () => {
    const draftCell: FlowMatrixCellDto = {
      weekStart: "2026-08-03",
      plan: 0,
      committed: {
        total: 500_000,
        items: [{
          kind: "draft",
          dteId: "draft-ep",
          label: "Transmat",
          fecha: "2026-08-04",
          monto: 500_000,
          issueYmd: "2026-08-04",
          terminoDias: 3,
          cobroEstYmd: "2026-08-07",
          sentDocs: { proforma: false, estadoPago: true },
        }],
      },
      real: null,
      effective: 500_000,
      layer: "committed",
    };
    const model = buildCellSheetModel(row(), draftCell, ctx, cbs());
    expect(model.folioGroups).toHaveLength(1);
    expect(model.folioGroups[0]!.header.titleLine).toContain("EP Transmat");
    expect(model.folioGroups[0]!.header.statusLine).toContain("Fecha doc");
    expect(model.folioGroups[0]!.header.statusLine).toContain("término 3 d");
    expect(model.folioGroups[0]!.items.some((i) => i.key.startsWith("move-draft-"))).toBe(true);
  });
});
