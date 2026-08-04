/**
 * Derivador COMPROMETIDO · egresos (función pura, cero writes).
 *
 * Fuentes:
 *  1. Hitos payroll/F29 pre-computados por el loader (líquido, quincena,
 *     Previred, IVA F29) → fila por MAPA FIJO: primero fila CATEGORY con el
 *     código canónico, si no fila MANUAL por nombre canónico, si no
 *     "Otros egresos".
 *  2. DTEs RECIBIDOS por pagar → semana de vencimiento (dueDate ?? emisión +
 *     término del proveedor), vencidos clampean a la semana actual. Fila:
 *     SUPPLIER del proveedor → CATEGORY de sus cuentas contables → fallback.
 */
import { weekStartYmd, ymdToDate } from "./weeks";
import { buildExpenseIndexes, matchExpenseRow } from "./row-match";
import {
  pushCommitted,
  UNMATCHED_EXPENSE_KEY,
  type CommittedByRow,
  type FlowRowRef,
} from "./types";

export type ExpenseMilestoneKey =
  | "liquido"
  | "quincena"
  | "previred"
  | "f29"
  | "turnos_extra";

export interface ExpenseMilestoneInput {
  key: ExpenseMilestoneKey;
  label: string;
  /** Fecha de pago del hito (YYYY-MM-DD). */
  dateYmd: string;
  amountClp: number;
}

export interface ReceivedDteExpenseInput {
  id: string;
  folio: number;
  dateYmd: string;
  dueDateYmd: string | null;
  /** Fallback de término de pago del proveedor (días desde emisión). */
  paymentTermDays: number;
  pendingClp: number;
  supplierId: string | null;
  /** Categoría resuelta por el loader (líneas → cuentas → categoría). */
  categoryId: string | null;
  issuerName: string;
}

export interface CommittedExpenseArgs {
  rows: FlowRowRef[];
  weeks: string[];
  todayYmd: string;
  milestones: ExpenseMilestoneInput[];
  receivedDtes: ReceivedDteExpenseInput[];
  /** categoryId → code (para el mapa fijo de hitos). */
  categoryCodeById: Map<string, string>;
}

/** Mapa fijo hito → fila canónica (documentado en AUDIT.md §2/B4). */
const MILESTONE_ROW_MAP: Record<
  ExpenseMilestoneKey,
  { categoryCode: string; canonicalNames: string[] }
> = {
  liquido: { categoryCode: "EGR_SUELDO", canonicalNames: ["sueldos líquidos", "sueldos liquidos", "sueldos"] },
  quincena: { categoryCode: "EGR_QUINCENA", canonicalNames: ["quincena (anticipos)", "quincena", "anticipos"] },
  previred: { categoryCode: "EGR_PREVIRED", canonicalNames: ["imposiciones (previred)", "previred", "imposiciones"] },
  f29: { categoryCode: "EGR_IVA_F29", canonicalNames: ["iva f29", "f29 (iva + ppm)", "f29"] },
  turnos_extra: { categoryCode: "EGR_TURNO_EXTRA", canonicalNames: ["turnos extra", "turno extra"] },
};

/** Semana de pago; si venció, clampea a la semana actual (pagable ya). */
function payWeek(fechaYmd: string, todayYmd: string): string {
  const currentWeek = weekStartYmd(ymdToDate(todayYmd) ?? new Date());
  const week = weekStartYmd(ymdToDate(fechaYmd) ?? new Date());
  return week < currentWeek ? currentWeek : week;
}

export function deriveCommittedExpense(args: CommittedExpenseArgs): CommittedByRow {
  const out: CommittedByRow = new Map();
  if (args.weeks.length === 0) return out;
  const firstWeek = args.weeks[0];
  const lastWeek = args.weeks[args.weeks.length - 1];
  const inRange = (w: string) => w >= firstWeek && w <= lastWeek;
  const idx = buildExpenseIndexes(args.rows, args.categoryCodeById);

  for (const m of args.milestones) {
    if (m.amountClp <= 0) continue;
    // Hitos pasados quedan en su semana natural (el real ya los capturó);
    // no clampean para no duplicar visualmente contra la semana actual.
    const week = weekStartYmd(ymdToDate(m.dateYmd) ?? new Date());
    if (!inRange(week)) continue;
    const map = MILESTONE_ROW_MAP[m.key];
    const rowKey =
      idx.byCategoryCode.get(map.categoryCode) ??
      map.canonicalNames.map((n) => idx.byName.get(n)).find(Boolean) ??
      UNMATCHED_EXPENSE_KEY;
    pushCommitted(out, rowKey, week, {
      kind: "scheduled",
      label: m.label,
      fecha: m.dateYmd,
      monto: Math.round(m.amountClp),
    });
  }

  for (const d of args.receivedDtes) {
    if (d.pendingClp <= 0) continue;
    const est =
      d.dueDateYmd ??
      (() => {
        const [y, mo, da] = d.dateYmd.split("-").map(Number);
        return new Date(Date.UTC(y, mo - 1, da + d.paymentTermDays)).toISOString().slice(0, 10);
      })();
    const week = payWeek(est, args.todayYmd);
    if (!inRange(week)) continue;
    const rowKey = matchExpenseRow(idx, {
      supplierId: d.supplierId,
      categoryId: d.categoryId,
    });
    pushCommitted(out, rowKey, week, {
      kind: "dte",
      dteId: d.id,
      folio: d.folio,
      label: d.issuerName,
      fecha: est,
      monto: Math.round(d.pendingClp),
    });
  }

  return out;
}
