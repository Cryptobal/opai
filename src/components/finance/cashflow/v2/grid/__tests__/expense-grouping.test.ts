import { describe, it, expect } from "vitest";
import type {
  FinanceCashflowItemSource,
  ProjectionBucket,
  ProjectionRow,
  ProjectionRowItemDetail,
  ProjectionRowItemValue,
} from "@/modules/finance/cashflow/types";
import { expenseRows } from "../expense-grouping";
import { sectionBucketTotals } from "../grid-helpers";

const BUCKETS = ["W1", "W2", "W3"];

function bucket(key: string): ProjectionBucket {
  return {
    key,
    label: key,
    start: new Date(),
    end: new Date(),
    income: 0,
    expense: 0,
    net: 0,
    actualIncome: 0,
    actualExpense: 0,
    varianceClp: 0,
    actualBankIncome: 0,
    actualBankExpense: 0,
    actualBankNet: 0,
    bankVarianceClp: 0,
    occurrences: [],
  };
}
const BUCKET_OBJS = BUCKETS.map(bucket);

function value(
  bucketKey: string,
  amount: number,
  extra: Partial<ProjectionRowItemValue> = {},
): ProjectionRowItemValue {
  return {
    bucketKey,
    amount,
    actualAmount: null,
    occurrenceId: null,
    scheduledDate: "",
    cellStatus: "PROJECTED",
    dteId: null,
    dteFolio: null,
    dteGrossAmount: null,
    daysOverdue: 0,
    reconciled: false,
    dtes: [],
    ...extra,
  };
}

/** Item con montos por bucket. `amounts` map bucketKey → amount. */
function item(
  itemId: string,
  itemName: string,
  source: FinanceCashflowItemSource,
  amounts: Record<string, number>,
  extra: Partial<ProjectionRowItemDetail> = {},
): ProjectionRowItemDetail {
  const values = BUCKETS.map((k) =>
    value(k, amounts[k] ?? 0, k in amounts ? { reconciled: !!extra.isConciliacion } : {}),
  );
  const total = values.reduce((s, v) => s + v.amount, 0);
  return {
    itemId,
    itemName,
    installationId: null,
    installationName: null,
    crmAccountId: null,
    crmAccountName: null,
    baseAmount: 0,
    currency: "CLP",
    source,
    sourceRefCode: null,
    hasIpcAdjustment: false,
    ipcAdjustmentMonths: null,
    headcount: 0,
    nickname: null,
    modoCobro: "DIRECTO",
    values,
    total,
    totalActual: 0,
    ...extra,
  };
}

function row(
  categoryId: string,
  categoryName: string,
  items: ProjectionRowItemDetail[],
): ProjectionRow {
  return {
    categoryId,
    categoryCode: categoryId.toUpperCase(),
    categoryName,
    kind: "EXPENSE",
    values: [],
    total: 0,
    items,
  };
}

describe("expenseRows — agrupación de conciliación por cuenta", () => {
  it("INVARIANTE: el subtotal por bucket es idéntico al de los items crudos", () => {
    const rows: ProjectionRow[] = [
      row("cat_otros", "Otros egresos", [
        item("btx1", "Conciliación · Otros egresos", "MANUAL", { W1: 100 }, { isConciliacion: true }),
        item("btx2", "Conciliación · Otros egresos", "MANUAL", { W1: 50, W2: 30 }, { isConciliacion: true }),
        item("btx3", "Conciliación · Otros egresos", "MANUAL", { W3: 70 }, { isConciliacion: true }),
      ]),
      row("cat_sist", "Sistemas", [
        item("btx4", "Compra OPENAI* CHATGPT C", "MANUAL", { W2: 25 }, { isConciliacion: true }),
      ]),
      row("cat_arr", "Arriendo", [
        item("arr1", "Arriendo oficina", "CONTRACT", { W1: 500, W2: 500, W3: 500 }),
      ]),
    ];

    // Total esperado bucket-a-bucket sumando TODOS los items crudos.
    const rawTotals = BUCKETS.map((k) =>
      rows
        .flatMap((r) => r.items)
        .reduce(
          (s, it) => s + (it.values.find((v) => v.bucketKey === k)?.amount ?? 0),
          0,
        ),
    );

    const grouped = expenseRows(rows);
    const totals = sectionBucketTotals(grouped, BUCKET_OBJS);

    expect(totals).toEqual(rawTotals);
    // W1 = 100+50+500 = 650; W2 = 30+25+500 = 555; W3 = 70+500 = 570
    expect(totals).toEqual([650, 555, 570]);
  });

  it("6 movimientos de 'Otros egresos' → 1 fila con itemName cuenta y 6 children", () => {
    const concItems = Array.from({ length: 6 }, (_, i) =>
      item(`btx${i}`, `Mov ${i}`, "MANUAL", { [BUCKETS[i % 3]]: 10 * (i + 1) }, { isConciliacion: true }),
    );
    const rows = [row("cat_otros", "Otros egresos", concItems)];

    const grouped = expenseRows(rows);
    expect(grouped).toHaveLength(1);
    expect(grouped[0].item.itemName).toBe("Otros egresos");
    expect(grouped[0].item.isConciliacionGroup).toBe(true);
    expect(grouped[0].item.children).toHaveLength(6);
  });

  it("caso 'Sistemas' → itemName es la cuenta, la glosa del banco queda en children[0]", () => {
    const rows = [
      row("cat_sist", "Sistemas", [
        item("btx4", "Compra OPENAI* CHATGPT C", "MANUAL", { W1: 25 }, { isConciliacion: true }),
      ]),
    ];
    const grouped = expenseRows(rows);
    expect(grouped[0].item.itemName).toBe("Sistemas");
    expect(grouped[0].item.children?.[0].itemName).toBe("Compra OPENAI* CHATGPT C");
  });

  it("egresos normales (arriendo, abogado) NO se agrupan: fila propia", () => {
    const rows = [
      row("cat_arr", "Arriendo", [
        item("arr1", "Arriendo oficina", "CONTRACT", { W1: 500 }),
      ]),
      row("cat_abo", "Legal", [
        item("abo1", "Abogado", "MANUAL", { W2: 200 }),
      ]),
    ];
    const grouped = expenseRows(rows);
    expect(grouped).toHaveLength(2);
    expect(grouped.every((g) => !g.item.isConciliacionGroup)).toBe(true);
  });

  it("la fila agrupada no es movible: occurrenceId null en todos los buckets", () => {
    const rows = [
      row("cat_otros", "Otros egresos", [
        item("btx1", "Mov 1", "MANUAL", { W1: 100 }, { isConciliacion: true }),
        item("btx2", "Mov 2", "MANUAL", { W2: 50 }, { isConciliacion: true }),
      ]),
    ];
    const grouped = expenseRows(rows);
    expect(grouped[0].item.values.every((v) => v.occurrenceId === null)).toBe(true);
    // Sin objeto `group` → no arrastrable como payroll.
    expect(grouped[0].group).toBeUndefined();
  });

  it("coexistencia: payroll colapsa por source y no se mezcla con conciliación", () => {
    const rows = [
      row("cat_sueldos", "Sueldos", [
        item("p1", "Sueldo A", "PAYROLL_LIQUIDO", { W1: 300 }),
        item("p2", "Sueldo B", "PAYROLL_LIQUIDO", { W1: 200 }),
      ]),
      row("cat_otros", "Otros egresos", [
        item("btx1", "Mov 1", "MANUAL", { W2: 40 }, { isConciliacion: true }),
      ]),
    ];
    const grouped = expenseRows(rows);
    const payrollRow = grouped.find((g) => g.item.itemId === "_group:PAYROLL_LIQUIDO");
    const concRow = grouped.find((g) => g.item.itemId === "_conc:cat_otros");
    expect(payrollRow).toBeDefined();
    expect(payrollRow?.item.isConciliacionGroup).toBeFalsy();
    expect(concRow?.item.isConciliacionGroup).toBe(true);
    // Payroll suma 500 en W1; conciliación suma 40 en W2 → subtotales.
    expect(sectionBucketTotals(grouped, BUCKET_OBJS)).toEqual([500, 40, 0]);
  });
});
