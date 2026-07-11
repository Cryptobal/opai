import type {
  FinanceCashflowItemSource,
  ProjectionRow,
  ProjectionRowItemDetail,
  ProjectionRowItemValue,
} from "@/modules/finance/cashflow/types";
import { itemRowsForKind, type GridItemRow } from "./grid-helpers";
import { buildConcRow } from "./expense-conc-grouping";

/** Tipos de egreso que agrupan varias instalaciones en una sola línea: hoy la
 *  proyección emite una occurrence por instalación (sourceRefId=installationId)
 *  para cada uno, generando cientos de filas. La grilla los colapsa a una fila
 *  por tipo, sumando las instalaciones por semana. El resto de egresos (IVA,
 *  quincena, retiro socios, arriendo, …) ya son línea única y no se tocan. */
export const GROUPED_EXPENSE_SOURCES: ReadonlySet<FinanceCashflowItemSource> =
  new Set(["PAYROLL_LIQUIDO", "PAYROLL_PREVIRED", "TURNOS_EXTRA"]);

/** Orden lógico de las filas agrupadas: sueldos, previred, turnos. El resto de
 *  egresos va después, ordenado por nombre (igual que itemRowsForKind). */
const GROUP_ORDER: FinanceCashflowItemSource[] = [
  "PAYROLL_LIQUIDO",
  "PAYROLL_PREVIRED",
  "TURNOS_EXTRA",
];

/** ¿Es un source que debe colapsarse a una fila agregada? */
export function isGroupedExpenseSource(source: FinanceCashflowItemSource): boolean {
  return GROUPED_EXPENSE_SOURCES.has(source);
}

/**
 * Filas de la sección EGRESOS con los tipos payroll/previred/turnos colapsados
 * a una línea por tipo (suma de todas las instalaciones por semana) y el resto
 * como filas individuales. La suma por bucket es idéntica a la de las filas sin
 * agrupar, por lo que el subtotal de egresos y la fila FC cuadran igual.
 *
 * Cada fila agrupada conserva, por bucket, la lista de occurrenceId movibles de
 * las instalaciones sumadas (`group.occurrenceIdsByBucket`) para que el arrastre
 * mueva todas juntas (B4A). Los occurrenceId de cuotas ya pagadas no aparecen
 * (la proyección deja su value.occurrenceId en null), así que quedan fijas.
 */
export function expenseRows(rows: ProjectionRow[]): GridItemRow[] {
  // Items de egreso con el nombre de su categoría (la categoría vive en la
  // ProjectionRow, no en el item) para etiquetar la fila agregada.
  const grouped = new Map<
    FinanceCashflowItemSource,
    { items: ProjectionRowItemDetail[]; categoryName: string }
  >();
  // Tercer cubo: movimientos de conciliación (isConciliacion), agrupados por
  // CUENTA (categoría, que vive en la ProjectionRow) en vez de por source.
  const concByCategory = new Map<
    string,
    { categoryId: string; categoryName: string; items: ProjectionRowItemDetail[] }
  >();
  const individualRows: ProjectionRow[] = [];

  for (const row of rows) {
    if (row.kind !== "EXPENSE") continue;
    const groupedItems = row.items.filter(
      (i) => GROUPED_EXPENSE_SOURCES.has(i.source) && !i.isConciliacion,
    );
    const concItems = row.items.filter((i) => i.isConciliacion);
    const restItems = row.items.filter(
      (i) => !GROUPED_EXPENSE_SOURCES.has(i.source) && !i.isConciliacion,
    );
    for (const item of groupedItems) {
      const g = grouped.get(item.source) ?? {
        items: [],
        categoryName: row.categoryName,
      };
      g.items.push(item);
      grouped.set(item.source, g);
    }
    if (concItems.length > 0) {
      const catId = row.categoryId ?? `_nocat:${row.categoryCode}`;
      const c = concByCategory.get(catId) ?? {
        categoryId: catId,
        categoryName: row.categoryName,
        items: [],
      };
      c.items.push(...concItems);
      concByCategory.set(catId, c);
    }
    if (restItems.length > 0) {
      individualRows.push({ ...row, items: restItems });
    }
  }

  const groupRows: GridItemRow[] = [];
  for (const source of GROUP_ORDER) {
    const g = grouped.get(source);
    if (g && g.items.length > 0) groupRows.push(buildGroupRow(source, g));
  }

  // Filas de conciliación: una por cuenta, ordenadas por nombre de cuenta
  // (consistente con itemSortKey).
  const concRows: GridItemRow[] = Array.from(concByCategory.values())
    .map((c) => buildConcRow(c.categoryId, c.categoryName, c.items))
    .sort((a, b) =>
      a.item.itemName.localeCompare(b.item.itemName, "es", {
        sensitivity: "base",
      }),
    );

  // Filas no agrupadas: reutiliza el aplanado/orden estándar por nombre.
  const rest = itemRowsForKind(individualRows, "EXPENSE");
  return [...groupRows, ...concRows, ...rest];
}

/** Construye la fila agregada de un tipo de egreso sumando sus instalaciones
 *  por bucket y recolectando los occurrenceId movibles por bucket. */
function buildGroupRow(
  source: FinanceCashflowItemSource,
  g: { items: ProjectionRowItemDetail[]; categoryName: string },
): GridItemRow {
  // Orden canónico de buckets tomado del primer item (todos comparten el mismo
  // set de buckets desde el motor de proyección).
  const bucketKeys = g.items[0].values.map((v) => v.bucketKey);
  const occurrencesByBucket = new Map<
    string,
    { id: string; amountClp: number }[]
  >();
  const valueByBucket = new Map<string, ProjectionRowItemValue>();
  const summedValues: ProjectionRowItemValue[] = [];
  let total = 0;
  let totalActual = 0;

  for (const bucketKey of bucketKeys) {
    let amount = 0;
    let actualAmount: number | null = null;
    let scheduledDate = "";
    let overridden = false;
    const occs: { id: string; amountClp: number }[] = [];
    for (const item of g.items) {
      const v = item.values.find((x) => x.bucketKey === bucketKey);
      if (!v) continue;
      amount += v.amount;
      if (v.actualAmount != null) {
        actualAmount = (actualAmount ?? 0) + v.actualAmount;
      }
      if (!scheduledDate && v.scheduledDate) scheduledDate = v.scheduledDate;
      if (v.hasAmountOverride) overridden = true;
      // value.occurrenceId ya excluye las pagadas (el motor lo deja en null
      // para status=PAID), así que la lista queda solo con las movibles. El
      // monto por instalación es el amount de su value (un item = una
      // instalación) — alimenta el reparto proporcional al editar el total.
      if (v.occurrenceId) occs.push({ id: v.occurrenceId, amountClp: v.amount });
    }
    if (occs.length > 0) occurrencesByBucket.set(bucketKey, occs);
    total += amount;
    if (actualAmount != null) totalActual += actualAmount;
    const value: ProjectionRowItemValue = {
      bucketKey,
      amount,
      actualAmount,
      hasAmountOverride: overridden,
      occurrenceId: occs[0]?.id ?? null,
      scheduledDate,
      cellStatus: "PROJECTED",
      dteId: null,
      dteFolio: null,
      dteGrossAmount: null,
      daysOverdue: 0,
      dtes: [],
    };
    summedValues.push(value);
    valueByBucket.set(bucketKey, value);
  }

  const first = g.items[0];
  const item: ProjectionRowItemDetail = {
    ...first,
    itemId: `_group:${source}`,
    itemName: g.categoryName,
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
    values: summedValues,
    total,
    totalActual,
  };

  return {
    item,
    valueByBucket,
    group: { source, occurrencesByBucket },
  };
}
