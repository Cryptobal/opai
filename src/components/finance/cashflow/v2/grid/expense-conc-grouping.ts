import type {
  ProjectionRowItemDetail,
  ProjectionRowItemValue,
} from "@/modules/finance/cashflow/types";
import type { GridItemRow } from "./grid-helpers";

/**
 * Construye la fila de EGRESOS agrupada por CUENTA para los movimientos de
 * conciliación (isConciliacion) de una categoría: una sola línea con el nombre
 * de la cuenta, los montos sumados por bucket y el desglose por movimiento en
 * `children` (visible al expandir).
 *
 * La suma por bucket es idéntica a la de los movimientos sin agrupar (misma
 * mecánica que `buildGroupRow`), por lo que el subtotal de egresos y la fila FC
 * cuadran igual — es re-agrupación visual, no re-cálculo.
 *
 * A diferencia de payroll (que se arrastra en grupo), estos movimientos están
 * conciliados y son inmutables: la fila NO expone occurrenceId ni objeto
 * `group`, así que no es arrastrable ni editable (candado 🔒 preservado).
 */
export function buildConcRow(
  categoryId: string,
  categoryName: string,
  items: ProjectionRowItemDetail[],
): GridItemRow {
  // Todos los items comparten el mismo set de buckets desde el motor.
  const bucketKeys = items[0].values.map((v) => v.bucketKey);
  const valueByBucket = new Map<string, ProjectionRowItemValue>();
  const summedValues: ProjectionRowItemValue[] = [];
  let total = 0;
  let totalActual = 0;

  for (const bucketKey of bucketKeys) {
    let amount = 0;
    let actualAmount: number | null = null;
    let reconciled = false;
    for (const item of items) {
      const v = item.values.find((x) => x.bucketKey === bucketKey);
      if (!v) continue;
      amount += v.amount;
      if (v.actualAmount != null) {
        actualAmount = (actualAmount ?? 0) + v.actualAmount;
      }
      if (v.reconciled) reconciled = true;
    }
    total += amount;
    if (actualAmount != null) totalActual += actualAmount;
    const value: ProjectionRowItemValue = {
      bucketKey,
      amount,
      actualAmount,
      // Conciliada e inmutable: sin occurrenceId (no arrastrable/editable),
      // con `reconciled` para conservar el candado en la celda.
      occurrenceId: null,
      scheduledDate: "",
      cellStatus: "PROJECTED",
      dteId: null,
      dteFolio: null,
      dteGrossAmount: null,
      daysOverdue: 0,
      reconciled,
      dtes: [],
    };
    summedValues.push(value);
    valueByBucket.set(bucketKey, value);
  }

  const first = items[0];
  const item: ProjectionRowItemDetail = {
    ...first,
    itemId: `_conc:${categoryId}`,
    itemName: categoryName,
    installationId: null,
    installationName: null,
    crmAccountId: null,
    crmAccountName: null,
    nickname: null,
    baseAmount: 0,
    headcount: 0,
    hasIpcAdjustment: false,
    ipcAdjustmentMonths: null,
    sourceRefCode: null,
    isConciliacion: true,
    isConciliacionGroup: true,
    children: items,
    values: summedValues,
    total,
    totalActual,
  };

  return { item, valueByBucket };
}
