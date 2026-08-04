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
  | "impuesto_unico"
  | "f29"
  | "turnos_extra"
  | "retiro_socio"
  | "finiquitos"
  | "pct_sales";

export interface ExpenseMilestoneInput {
  key: ExpenseMilestoneKey;
  label: string;
  /** Fecha de pago del hito (YYYY-MM-DD). */
  dateYmd: string;
  amountClp: number;
  /** Nota de desglose (descuento TE, F29 clamp, etc.) — va al label si existe. */
  metaNote?: string;
  /** v5.1: fila destino explícita (PCT_SALES); salta el mapa canónico. */
  targetRowId?: string;
}

export interface TeWeeklyProjectionInput {
  weekYmd: string;
  amountClp: number;
  label: string;
}

/** Proyección % ventas por fila (derive-on-read). Monto SIGNADO cash en FINANCIAMIENTO. */
export interface PctSalesProjectionInput {
  rowId: string;
  weekYmd: string;
  dateYmd: string;
  /** Magnitud positiva en egresos; cash-signed en FINANCIAMIENTO (+ entra / − sale). */
  amountClp: number;
  label: string;
  /** Si true, amountClp ya es cash-signed (FINANCIAMIENTO). */
  cashSigned?: boolean;
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
  /** Proyección semanal TE (v5); semanas sin plan manual en fila TE. */
  teWeeklyProjections?: TeWeeklyProjectionInput[];
  /** rowId de la fila TE — si falta, se omite teWeeklyProjections. */
  teRowId?: string | null;
  /** Semanas con plan manual ≠0 en fila TE (no proyectar encima). */
  tePlanBlockedWeeks?: Set<string>;
  /** v5.1: reglas PCT_SALES evaluate-on-read por fila. */
  pctSalesProjections?: PctSalesProjectionInput[];
}

/** Mapa fijo hito → fila canónica (documentado en AUDIT.md §2/B4). */
const MILESTONE_ROW_MAP: Record<
  ExpenseMilestoneKey,
  { categoryCode: string; canonicalNames: string[] }
> = {
  liquido: { categoryCode: "EGR_SUELDO", canonicalNames: ["sueldos líquidos", "sueldos liquidos", "sueldos"] },
  quincena: { categoryCode: "EGR_QUINCENA", canonicalNames: ["quincena (anticipos)", "quincena", "anticipos"] },
  previred: { categoryCode: "EGR_PREVIRED", canonicalNames: ["imposiciones (previred)", "previred", "imposiciones"] },
  impuesto_unico: { categoryCode: "EGR_IVA_F29", canonicalNames: ["iva f29", "f29 (iva + ppm)", "f29"] },
  f29: { categoryCode: "EGR_IVA_F29", canonicalNames: ["iva f29", "f29 (iva + ppm)", "f29"] },
  turnos_extra: { categoryCode: "EGR_TURNO_EXTRA", canonicalNames: ["turnos extra", "turno extra"] },
  retiro_socio: { categoryCode: "EGR_RETIRO_SOCIO", canonicalNames: ["retiro socios", "retiro socio"] },
  finiquitos: { categoryCode: "__NONE__", canonicalNames: ["finiquitos", "finiquito"] },
  pct_sales: { categoryCode: "__NONE__", canonicalNames: [] },
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
    if (m.amountClp === 0) continue;
    if (m.amountClp < 0 && !m.targetRowId) continue;
    // Hitos pasados quedan en su semana natural (el real ya los capturó);
    // no clampean para no duplicar visualmente contra la semana actual.
    const week = weekStartYmd(ymdToDate(m.dateYmd) ?? new Date());
    if (!inRange(week)) continue;
    const map = MILESTONE_ROW_MAP[m.key];
    const rowKey =
      m.targetRowId ??
      idx.byCategoryCode.get(map.categoryCode) ??
      map.canonicalNames.map((n) => idx.byName.get(n)).find(Boolean) ??
      UNMATCHED_EXPENSE_KEY;
    const label = m.metaNote ? `${m.label} (${m.metaNote})` : m.label;
    pushCommitted(out, rowKey, week, {
      kind: "scheduled",
      label,
      fecha: m.dateYmd,
      monto: Math.round(m.amountClp),
    });
  }

  if (args.pctSalesProjections?.length) {
    for (const p of args.pctSalesProjections) {
      if (p.amountClp === 0 || !inRange(p.weekYmd)) continue;
      pushCommitted(out, p.rowId, p.weekYmd, {
        kind: "scheduled",
        label: p.label,
        fecha: p.dateYmd,
        monto: Math.round(p.amountClp),
      });
    }
  }

  if (args.teWeeklyProjections?.length && args.teRowId) {
    const blocked = args.tePlanBlockedWeeks ?? new Set<string>();
    const map = MILESTONE_ROW_MAP.turnos_extra;
    const teRowKey =
      args.teRowId ??
      idx.byCategoryCode.get(map.categoryCode) ??
      map.canonicalNames.map((n) => idx.byName.get(n)).find(Boolean) ??
      UNMATCHED_EXPENSE_KEY;
    for (const te of args.teWeeklyProjections) {
      if (te.amountClp <= 0 || !inRange(te.weekYmd) || blocked.has(te.weekYmd)) continue;
      pushCommitted(out, teRowKey, te.weekYmd, {
        kind: "scheduled",
        label: te.label,
        fecha: te.weekYmd,
        monto: Math.round(te.amountClp),
      });
    }
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
