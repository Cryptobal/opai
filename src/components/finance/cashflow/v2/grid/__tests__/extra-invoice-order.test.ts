import { describe, it, expect } from "vitest";
import { itemRowsForKind } from "../grid-helpers";
import type {
  ProjectionRow,
  ProjectionRowItemDetail,
} from "@/modules/finance/cashflow/types";

/**
 * Fix Bug B: la sub-fila `+ EXTRA` debe quedar SIEMPRE inmediatamente debajo de
 * su fila de contrato (mismo cliente/instalación), en toda corrida.
 *
 * La extra hereda cuenta e instalación del padre (deliberado, PR #614), lo que
 * produce una clave de orden idéntica. Sin un desempate determinístico, el
 * orden relativo padre/extra dependía del orden de inserción del Map y la extra
 * podía renderizarse ENCIMA del padre (caso real Limpiotec / GL Events).
 * `itemSortKey` ahora agrega rank (padre 0 / extra 1) + tie por itemId.
 */

function item(part: Partial<ProjectionRowItemDetail>): ProjectionRowItemDetail {
  return {
    itemId: "item_x",
    itemName: "Item X",
    installationId: "inst_1",
    installationName: "Sede 1",
    crmAccountId: "crm_1",
    crmAccountName: "Cliente Uno",
    baseAmount: 0,
    currency: "CLP",
    source: "CONTRACT",
    sourceRefCode: null,
    hasIpcAdjustment: false,
    ipcAdjustmentMonths: null,
    headcount: 0,
    nickname: null,
    modoCobro: "DIRECTO",
    values: [],
    total: 0,
    totalActual: 0,
    ...part,
  };
}

/** Envuelve items en una única ProjectionRow INCOME (itemRowsForKind aplana). */
function incomeRows(items: ProjectionRowItemDetail[]): ProjectionRow[] {
  return [
    {
      categoryId: "cat_1",
      categoryCode: "ING",
      categoryName: "Ingresos",
      kind: "INCOME",
      values: [],
      total: 0,
      items,
    },
  ];
}

const names = (rows: { item: ProjectionRowItemDetail }[]) =>
  rows.map((r) => r.item.itemId);

describe("Bug B — orden estable de la sub-fila EXTRA debajo de su contrato", () => {
  it("FIX: contrato + 1 extra (misma cuenta/instalación) → la extra queda inmediatamente debajo del padre", () => {
    const parent = item({ itemId: "item_limpiotec", isExtraInvoice: false });
    const extra = item({ itemId: "_extra:dte_1", isExtraInvoice: true });

    const out = itemRowsForKind(incomeRows([parent, extra]), "INCOME");

    const pIdx = out.findIndex((r) => r.item.itemId === "item_limpiotec");
    const eIdx = out.findIndex((r) => r.item.itemId === "_extra:dte_1");
    expect(pIdx).toBeGreaterThanOrEqual(0);
    expect(eIdx).toBe(pIdx + 1);
  });

  it("DETERMINISMO: el mismo input en orden inverso produce la MISMA salida", () => {
    const parent = item({ itemId: "item_limpiotec", isExtraInvoice: false });
    const extra = item({ itemId: "_extra:dte_1", isExtraInvoice: true });

    const forward = names(itemRowsForKind(incomeRows([parent, extra]), "INCOME"));
    const reverse = names(itemRowsForKind(incomeRows([extra, parent]), "INCOME"));

    expect(reverse).toEqual(forward);
    // Y el padre precede a la extra en ambas.
    expect(forward).toEqual(["item_limpiotec", "_extra:dte_1"]);
  });

  it("2 extras del mismo cliente/instalación → contiguas debajo del padre, orden estable por itemId", () => {
    const parent = item({ itemId: "item_p", isExtraInvoice: false });
    const extraA = item({ itemId: "_extra:dte_a", isExtraInvoice: true });
    const extraB = item({ itemId: "_extra:dte_b", isExtraInvoice: true });

    // Orden de entrada revuelto a propósito.
    const out = names(
      itemRowsForKind(incomeRows([extraB, parent, extraA]), "INCOME"),
    );
    expect(out).toEqual(["item_p", "_extra:dte_a", "_extra:dte_b"]);

    // Determinismo: otro orden de entrada, misma salida.
    const out2 = names(
      itemRowsForKind(incomeRows([extraA, extraB, parent]), "INCOME"),
    );
    expect(out2).toEqual(out);
  });

  it("dos clientes distintos, cada uno con su extra → cada extra bajo SU padre, sin cruzarse (GL Events / Limpiotec)", () => {
    const gl = item({
      itemId: "item_gl",
      crmAccountName: "GL Events",
      installationName: "Centro",
      isExtraInvoice: false,
    });
    const glExtra = item({
      itemId: "_extra:dte_gl",
      crmAccountName: "GL Events",
      installationName: "Centro",
      isExtraInvoice: true,
    });
    const limp = item({
      itemId: "item_limp",
      crmAccountName: "Limpiotec",
      installationName: "Quilicura",
      isExtraInvoice: false,
    });
    const limpExtra = item({
      itemId: "_extra:dte_limp",
      crmAccountName: "Limpiotec",
      installationName: "Quilicura",
      isExtraInvoice: true,
    });

    const out = names(
      itemRowsForKind(
        // entrada revuelta: la extra de Limpiotec llega antes que su padre y
        // antes que GL Events — exactamente el escenario del bug.
        incomeRows([limpExtra, gl, limp, glExtra]),
        "INCOME",
      ),
    );

    // GL Events (G) precede a Limpiotec (L); cada extra pegada a su padre.
    expect(out).toEqual([
      "item_gl",
      "_extra:dte_gl",
      "item_limp",
      "_extra:dte_limp",
    ]);

    // La extra de Limpiotec NO cuelga de GL Events.
    const glExtraIdx = out.indexOf("_extra:dte_gl");
    const limpExtraIdx = out.indexOf("_extra:dte_limp");
    expect(out[glExtraIdx - 1]).toBe("item_gl");
    expect(out[limpExtraIdx - 1]).toBe("item_limp");
  });

  it("no-regresión: filas sin isExtraInvoice mantienen orden alfabético por cuenta + instalación", () => {
    const a = item({
      itemId: "a",
      crmAccountName: "Alfa",
      installationName: "Sur",
    });
    const b = item({
      itemId: "b",
      crmAccountName: "Alfa",
      installationName: "Norte",
    });
    const c = item({
      itemId: "c",
      crmAccountName: "Beta",
      installationName: "Centro",
    });

    const out = names(itemRowsForKind(incomeRows([c, a, b]), "INCOME"));
    // Alfa·Norte, Alfa·Sur, Beta·Centro.
    expect(out).toEqual(["b", "a", "c"]);
  });

  it("no-regresión: filas sin crmAccountName siguen al final (sentinel ￿)", () => {
    const withAcct = item({
      itemId: "con",
      crmAccountName: "Zeta",
      installationName: "X",
    });
    const noAcct = item({
      itemId: "sin",
      crmAccountName: null,
      installationName: null,
      itemName: "Aaa suelto",
    });

    const out = names(itemRowsForKind(incomeRows([noAcct, withAcct]), "INCOME"));
    // "Zeta" tiene cuenta → va antes que el item sin cuenta (sentinel al final),
    // aunque alfabéticamente "Aaa" < "Zeta".
    expect(out).toEqual(["con", "sin"]);
  });

  it("no-regresión: sin filas extra, un cliente con 2 instalaciones ordena por instalación", () => {
    const i2 = item({ itemId: "i2", installationName: "Sede 2" });
    const i1 = item({ itemId: "i1", installationName: "Sede 1" });
    const out = names(itemRowsForKind(incomeRows([i2, i1]), "INCOME"));
    expect(out).toEqual(["i1", "i2"]);
  });
});
