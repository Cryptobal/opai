import { describe, it, expect, vi } from "vitest";
import {
  buildCellMenu,
  buildCellSheetModel,
  filterMoveTargetWeeks,
  panelActionsFromCellMenu,
  resolveNextWeekKey,
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
    onMoveParametricCommitted: vi.fn(),
    onMoveDte: vi.fn(),
    onViewDetail: vi.fn(),
    onViewDte: vi.fn(),
    onExcludeDte: vi.fn(),
    onRegisterPayment: vi.fn(),
    onSendCobranza: vi.fn(),
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
    const weekKeys = moveSub.filter((i) => i.key.startsWith("mdte-")).map((i) => i.key);
    // Desde 2026-08-03: anterior S26 + posteriores S33/S34 (sin headers HACIA ATRÁS/ADELANTE).
    expect(weekKeys).toEqual([
      "mdte-dte-1-2026-06-22",
      "mdte-dte-1-2026-08-10",
      "mdte-dte-1-2026-08-17",
    ]);
    expect(moveSub.find((i) => i.key === "mdte-dte-1-2026-08-10")?.highlight).toBe("next-week");
    expect(moveSub.some((i) => String(i.label).includes("HACIA ATRÁS"))).toBe(false);
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

  it("mover plan resalta la próxima semana en el submenú", () => {
    const planCell: FlowMatrixCellDto = {
      weekStart: "2026-08-24",
      plan: 27_080_000,
      committed: null,
      real: null,
      effective: 27_080_000,
      layer: "plan",
    };
    const openWeeks = [
      { key: "2026-07-20", weekStart: "2026-07-20", label: "S30", isCurrent: false, isPast: true, weekCount: 1, monthKey: "2026-07" },
      { key: "2026-08-10", weekStart: "2026-08-10", label: "S33", isCurrent: false, isPast: false, weekCount: 1, monthKey: "2026-08" },
      { key: "2026-08-17", weekStart: "2026-08-17", label: "S34", isCurrent: false, isPast: false, weekCount: 1, monthKey: "2026-08" },
      { key: "2026-08-31", weekStart: "2026-08-31", label: "S36", isCurrent: false, isPast: false, weekCount: 1, monthKey: "2026-08" },
      { key: "2026-09-07", weekStart: "2026-09-07", label: "S37", isCurrent: false, isPast: false, weekCount: 1, monthKey: "2026-09" },
    ];
    const planCtx = {
      ...ctx,
      editable: true,
      reason: "",
      openWeeks,
      cellWeekStart: "2026-08-24",
    };
    const moveSub = buildCellMenu(row(), planCell, planCtx, cbs()).find((i) => i.key === "move")?.submenu ?? [];
    // Solo semana anterior inmediata (S34) + posteriores (S36, S37); no S30/S33.
    expect(moveSub.map((i) => i.key)).toEqual([
      "move-2026-08-17",
      "move-2026-08-31",
      "move-2026-09-07",
    ]);
    expect(resolveNextWeekKey(openWeeks, "2026-08-24")).toBe("2026-08-31");
    const nextItem = moveSub.find((i) => i.key === "move-2026-08-31");
    expect(nextItem?.highlight).toBe("next-week");
    expect(moveSub.find((i) => i.key === "move-2026-08-17")?.highlight).toBeUndefined();
  });

  it("filterMoveTargetWeeks deja solo la anterior y las siguientes", () => {
    const weeks = [
      { key: "2026-07-20", weekStart: "2026-07-20", label: "S30", isCurrent: false, isPast: true },
      { key: "2026-08-10", weekStart: "2026-08-10", label: "S33", isCurrent: false, isPast: false },
      { key: "2026-08-17", weekStart: "2026-08-17", label: "S34", isCurrent: false, isPast: false },
      { key: "2026-08-24", weekStart: "2026-08-24", label: "S35", isCurrent: false, isPast: false },
      { key: "2026-08-31", weekStart: "2026-08-31", label: "S36", isCurrent: false, isPast: false },
      { key: "2026-09-07", weekStart: "2026-09-07", label: "S37", isCurrent: false, isPast: false },
      { key: "2026-09-14", weekStart: "2026-09-14", label: "S38", isCurrent: false, isPast: false },
    ];
    // Desde S36: anterior = S35, luego S37, S38 (sin S30–S34).
    expect(filterMoveTargetWeeks(weeks, "2026-08-31").map((w) => w.label)).toEqual([
      "S35",
      "S37",
      "S38",
    ]);
  });

  it("mover F° desde celda solo lista anterior + posteriores", () => {
    const dteCell = cellWithDtes(1);
    const dteMoveWeeks = [
      { key: "2026-07-20", weekStart: "2026-07-20", label: "S30", isCurrent: false, isPast: true, weekCount: 1, monthKey: "2026-07" },
      { key: "2026-08-10", weekStart: "2026-08-10", label: "S33", isCurrent: false, isPast: true, weekCount: 1, monthKey: "2026-08" },
      { key: "2026-08-17", weekStart: "2026-08-17", label: "S34", isCurrent: false, isPast: false, weekCount: 1, monthKey: "2026-08" },
      { key: "2026-08-31", weekStart: "2026-08-31", label: "S36", isCurrent: false, isPast: false, weekCount: 1, monthKey: "2026-08" },
    ];
    const moveCtx = {
      ...ctx,
      dteMoveWeeks,
      cellWeekStart: "2026-08-24",
      currentWeek: "2026-08-24",
    };
    const moveSub =
      buildCellMenu(row(), dteCell, moveCtx, cbs()).find((i) => i.key === "move-dte-dte-1")?.submenu ??
      [];
    const weekKeys = moveSub
      .filter((i) => i.key.startsWith("mdte-"))
      .map((i) => i.key);
    expect(weekKeys).toEqual([
      "mdte-dte-1-2026-08-17",
      "mdte-dte-1-2026-08-31",
    ]);
    expect(moveSub.find((i) => i.key === "mdte-dte-1-2026-08-31")?.highlight).toBe("next-week");
    expect(moveSub.some((i) => i.key.includes("2026-07-20"))).toBe(false);
  });

  it("Retiro socios committed ofrece Mover a otra semana…", () => {
    const committedCell: FlowMatrixCellDto = {
      weekStart: "2026-08-03",
      plan: 0,
      committed: {
        total: 2_000_000,
        items: [{
          kind: "scheduled",
          label: "Retiro socios 2026-08",
          fecha: "2026-08-05",
          monto: 2_000_000,
        }],
      },
      real: null,
      effective: -2_000_000,
      layer: "committed",
    };
    const openWeeks = [
      { key: "2026-08-10", weekStart: "2026-08-10", label: "10–16 ago", isCurrent: false, isPast: false },
    ];
    const moveCtx = {
      ...ctx,
      editable: true,
      reason: "",
      openWeeks,
      canManage: true,
    };
    const items = buildCellMenu(
      row({ name: "Retiro socios", section: "FINANCIAMIENTO" }),
      committedCell,
      moveCtx,
      cbs(),
    );
    const move = items.find((i) => i.key === "move-parametric");
    expect(move?.label).toBe("Mover a otra semana…");
    expect(move?.disabled).toBe(false);
    expect(move?.submenu?.length).toBe(1);
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
    const weekKeys = moveSub.filter((i) => i.key.startsWith("mdte-")).map((i) => i.key);
    expect(weekKeys).toEqual([
      "mdte-draft-ep-2026-06-22",
      "mdte-draft-ep-2026-08-10",
      "mdte-draft-ep-2026-08-17",
    ]);
    expect(moveSub.find((i) => i.key === "mdte-draft-ep-2026-08-10")?.highlight).toBe("next-week");
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

function scheduledCell(withDte: boolean): FlowMatrixCellDto {
  const items = [
    ...(withDte
      ? [{
          kind: "dte" as const,
          dteId: "dte-1767",
          folio: 1767,
          label: "CIMS",
          fecha: "2026-07-21",
          monto: 5_006_345,
          emissionYmd: "2026-07-21",
          dueYmd: "2026-08-20",
        }]
      : []),
    {
      kind: "scheduled" as const,
      templateId: "tpl-cims",
      billingPeriod: "2026-08",
      label: "CIMS - La Reina",
      fecha: "2026-08-20",
      monto: 5_007_960,
      issueYmd: "2026-08-20",
    },
  ];
  return {
    weekStart: "2026-08-17",
    plan: 0,
    committed: { total: items.reduce((s, x) => s + x.monto, 0), items },
    real: null,
    effective: items.reduce((s, x) => s + x.monto, 0),
    layer: "committed",
  };
}

describe("buildCellMenu — programaciones movibles", () => {
  const schedCbs = (): CellMenuCallbacks => ({ ...cbs(), onMoveScheduled: vi.fn() });

  it("P sola ofrece Mover programación y no el move de plan deshabilitado", () => {
    const items = buildCellMenu(row({ name: "CIMS" }), scheduledCell(false), { ...ctx, editable: true, reason: "" }, schedCbs());
    expect(items.find((i) => i.key === "move")).toBeUndefined();
    expect(items.find((i) => i.key === "clear")).toBeUndefined();
    const move = items.find((i) => i.key.startsWith("move-sched-"));
    expect(move?.label).toBe("Mover esta P a…");
    expect(move?.disabled).toBe(false);
    const weekKeys = (move?.submenu ?? []).filter((i) => i.key.startsWith("mdte-")).map((i) => i.key);
    expect(weekKeys).toEqual([
      "mdte-tpl:tpl-cims::2026-08-2026-06-22",
      "mdte-tpl:tpl-cims::2026-08-2026-08-10",
      "mdte-tpl:tpl-cims::2026-08-2026-08-17",
    ]);
    expect(move?.submenu?.find((i) => i.key.endsWith("2026-08-10"))?.highlight).toBe("next-week");
  });

  it("celda con F° + P permite mover cada una por separado", () => {
    const items = buildCellMenu(row({ name: "CIMS" }), scheduledCell(true), ctx, schedCbs());
    expect(items.find((i) => i.key === "edit")).toBeUndefined();
    expect(items.find((i) => i.key.startsWith("move-sched-"))?.label).toBe("Mover esta P a…");
    expect(items.find((i) => i.key === "move-dte-dte-1767")?.label).toContain("Mover F°1767");
  });

  it("quincena (hito) ofrece Mover esta P", () => {
    const cell: FlowMatrixCellDto = {
      weekStart: "2026-08-10",
      plan: 0,
      committed: {
        total: 4_776_383,
        items: [{
          kind: "scheduled",
          milestoneKey: "quincena",
          billingPeriod: "2026-08",
          label: "Quincena / anticipos",
          fecha: "2026-08-15",
          monto: 4_776_383,
        }],
      },
      real: null,
      effective: 4_776_383,
      layer: "committed",
    };
    const items = buildCellMenu(
      row({ name: "Quincena (anticipos)", section: "REMUNERACIONES" }),
      cell,
      { ...ctx, editable: true, reason: "" },
      { ...cbs(), onMoveMilestone: vi.fn() },
    );
    const move = items.find((i) => i.key.startsWith("move-sched-"));
    expect(move?.label).toBe("Mover esta P a…");
    expect(move?.disabled).toBe(false);
    expect(move?.key).toContain("ms:quincena");
  });
});

describe("buildCellMenu — postergación de IVA", () => {
  const f29Cell: FlowMatrixCellDto = {
    weekStart: "2026-09-07",
    plan: 0,
    committed: {
      total: 2_500_000,
      items: [{
        kind: "scheduled",
        milestoneKey: "f29",
        billingPeriod: "2026-09",
        taxPeriod: "2026-08",
        label: "IVA F29 2026-08",
        fecha: "2026-09-12",
        monto: 2_500_000,
      }],
    },
    real: null,
    effective: 2_500_000,
    layer: "committed",
  };

  it("ofrece Postergar IVA en la celda F29", () => {
    const onPostponeIva = vi.fn();
    const items = buildCellMenu(
      row({ name: "IVA F29", section: "IMPUESTOS", canonicalKey: "IVA_F29" }),
      f29Cell,
      { ...ctx, canManage: true, reason: "" },
      { ...cbs(), onPostponeIva, onMoveMilestone: vi.fn() },
    );
    const item = items.find((i) => i.key === "iva-postpone-2026-08");
    expect(item?.label).toBe("Postergar IVA 2 meses (2026-08)");
    expect(item?.disabled).toBe(false);
    item?.onSelect?.();
    expect(onPostponeIva).toHaveBeenCalledWith("2026-08");
  });

  it("deshabilita Postergar sin cashflow_manage", () => {
    const items = buildCellMenu(
      row({ name: "IVA F29", section: "IMPUESTOS", canonicalKey: "IVA_F29" }),
      f29Cell,
      { ...ctx, canManage: false, reason: "Sin permiso de edición" },
      { ...cbs(), onPostponeIva: vi.fn() },
    );
    const item = items.find((i) => i.key === "iva-postpone-2026-08");
    expect(item?.disabled).toBe(true);
    expect(item?.reason).toBe("Sin permiso de edición");
  });

  it("ofrece Deshacer en la fila IVA postergado", () => {
    const onUndoIvaPostpone = vi.fn();
    const cell: FlowMatrixCellDto = {
      weekStart: "2026-11-16",
      plan: 0,
      committed: {
        total: 2_200_000,
        items: [{
          kind: "scheduled",
          milestoneKey: "iva_postergado",
          billingPeriod: "2026-11",
          taxPeriod: "2026-08",
          label: "IVA postergado 2026-08 (vence 20-11-2026)",
          fecha: "2026-11-20",
          monto: 2_200_000,
        }],
      },
      real: null,
      effective: 2_200_000,
      layer: "committed",
    };
    const items = buildCellMenu(
      row({ name: "IVA postergado", section: "IMPUESTOS", canonicalKey: "IVA_POSTERGADO" }),
      cell,
      { ...ctx, canManage: true, reason: "" },
      { ...cbs(), onUndoIvaPostpone, onMoveMilestone: vi.fn() },
    );
    const item = items.find((i) => i.key === "iva-undo-2026-08");
    expect(item?.label).toBe("Deshacer postergación (2026-08)");
    expect(item?.danger).toBe(true);
    item?.onSelect?.();
    expect(onUndoIvaPostpone).toHaveBeenCalledWith("2026-08");
  });
});

describe("panelActionsFromCellMenu", () => {
  it("quita Ver detalle e historial y nota; deja el resto", () => {
    const items = panelActionsFromCellMenu([
      { key: "view-dte", label: "Ver F°1797" },
      { key: "exclude-dte", label: "Excluir del flujo", danger: true },
      { key: "detail", label: "Ver detalle e historial", separatorBefore: true },
      { key: "note", label: "Agregar nota…" },
    ]);
    expect(items.map((i) => i.key)).toEqual(["view-dte", "exclude-dte"]);
  });
});
