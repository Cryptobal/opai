import { describe, expect, it } from "vitest";
import type { FlowMatrixCellDto } from "@/modules/finance/flow-v3/matrix-types";
import {
  CHIP_LEGEND_ITEMS,
  CORNER_LEGEND_ITEMS,
  resolveCellColorMeaning,
} from "../cell-color-meaning";

function cell(partial: Partial<FlowMatrixCellDto>): FlowMatrixCellDto {
  return {
    weekStart: "2026-08-03",
    plan: 0,
    committed: null,
    real: null,
    effective: 0,
    layer: "empty",
    note: null,
    ...partial,
  };
}

describe("resolveCellColorMeaning", () => {
  it("factura emitida (azul arriba)", () => {
    const m = resolveCellColorMeaning(
      cell({
        layer: "committed",
        effective: 1,
        committed: {
          total: 5_541_004,
          items: [{
            kind: "dte",
            dteId: "d1",
            folio: 1775,
            label: "East West",
            monto: 5_541_004,
            fecha: "2026-08-01",
          }],
        },
      }),
    );
    expect(m?.title).toBe("Factura emitida");
  });

  it("factura cedida (azul + verde)", () => {
    const m = resolveCellColorMeaning(
      cell({
        layer: "committed",
        effective: 1,
        committed: {
          total: 5_541_004,
          items: [{
            kind: "dte",
            dteId: "d1",
            folio: 1775,
            label: "East West",
            monto: 5_541_004,
            fecha: "2026-08-01",
            ceded: true,
          }],
        },
      }),
    );
    expect(m?.key).toBe("ceded");
    expect(m?.title).toBe("Factura cedida");
  });

  it("real conciliado", () => {
    const m = resolveCellColorMeaning(
      cell({
        layer: "real",
        effective: 100,
        real: { total: 100, items: [] },
      }),
    );
    expect(m?.title).toBe("Real (conciliado)");
  });

  it("borrador / EP / proforma", () => {
    expect(
      resolveCellColorMeaning(
        cell({
          layer: "committed",
          effective: 1,
          committed: {
            total: 10,
            items: [{
              kind: "draft",
              draftId: "b1",
              label: "X",
              monto: 10,
              fecha: "2026-08-01",
            }],
          },
        }),
      )?.title,
    ).toBe("Borrador");

    expect(
      resolveCellColorMeaning(
        cell({
          layer: "committed",
          effective: 1,
          committed: {
            total: 10,
            items: [{
              kind: "draft",
              draftId: "b1",
              label: "X",
              monto: 10,
              fecha: "2026-08-01",
              sentDocs: { estadoPago: true, proforma: false },
            }],
          },
        }),
      )?.title,
    ).toBe("EP enviado");

    expect(
      resolveCellColorMeaning(
        cell({
          layer: "committed",
          effective: 1,
          committed: {
            total: 10,
            items: [{
              kind: "draft",
              draftId: "b1",
              label: "X",
              monto: 10,
              fecha: "2026-08-01",
              sentDocs: { estadoPago: false, proforma: true },
            }],
          },
        }),
      )?.title,
    ).toBe("Proforma enviada");
  });

  it("programada sin marca", () => {
    const m = resolveCellColorMeaning(
      cell({
        layer: "committed",
        effective: 1,
        committed: {
          total: 10,
          items: [{
            kind: "scheduled",
            label: "Cuota",
            monto: 10,
            fecha: "2026-08-01",
          }],
        },
      }),
    );
    expect(m?.title).toBe("Programada");
  });
});

describe("leyendas modo color / modo cuñas", () => {
  it("modo color cubre etapas fuertes + borrador/programada/plan/nota", () => {
    expect(CHIP_LEGEND_ITEMS.map((i) => i.key)).toEqual([
      "real",
      "dte",
      "ceded",
      "draft",
      "scheduled",
      "plan",
      "note",
    ]);
    expect(CHIP_LEGEND_ITEMS.find((i) => i.key === "draft")?.icons).toBe(true);
  });

  it("modo cuñas cubre marcas principales y secundarias", () => {
    expect(CORNER_LEGEND_ITEMS.map((i) => i.key)).toEqual([
      "real",
      "dte",
      "ceded",
      "draft",
      "ep",
      "proforma",
      "scheduled",
      "plan",
      "note",
    ]);
  });
});
