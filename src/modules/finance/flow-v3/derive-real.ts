/**
 * Derivador REAL (función pura, cero writes).
 *
 * Movimientos bancarios visibles del rango → semana del movimiento (fecha del
 * abono/cargo, NO la planificada).
 *
 * Ingresos (abonos):
 *  - Solo entran a la planilla si el link es `DTE_ISSUED` y matchea una fila
 *    de cliente/programación. Anticipos de cesión (`FACTORING_OPERATION`),
 *    abonos sin conciliar y remanentes NO van a "Otros ingresos" — esa fila
 *    es manual.
 *  - La merma de factoring (link `EXPENSE` + cuenta en un abono, shortfall
 *    de conciliación) cae en la fila canónica "Costo factoring"
 *    (FINANCIAMIENTO), con monto negativo.
 *
 * Egresos (cargos): se rutean por links (DTE recibido, payroll, categoría);
 * el remanente sin conciliar sigue yendo a "Otros egresos".
 */
import { weekStartYmd, ymdToDate } from "./weeks";
import {
  buildExpenseIndexes,
  buildIncomeMatcher,
  matchExpenseRow,
  normalizeRowName,
} from "./row-match";
import { COST_FACTORING_ROW_NAME } from "./canonical-rows";
import {
  pushReal,
  UNMATCHED_EXPENSE_KEY,
  UNMATCHED_INCOME_KEY,
  type FlowRowRef,
  type RealByRow,
} from "./types";

export interface RealLinkInput {
  targetType: string;
  targetId: string | null;
  amountClp: number;
  accountPlanId: string | null;
}

export interface RealTxInput {
  id: string;
  dateYmd: string;
  /** Signado: + abono, − cargo. */
  amountClp: number;
  description: string;
  links: RealLinkInput[];
}

export interface DteRefInput {
  folio: number;
  direction: "ISSUED" | "RECEIVED";
  crmAccountId: string | null;
  installationId: string | null;
  /** Programación origen (solo ISSUED); rutea a la fila 1:1 del template. */
  recurringTemplateId?: string | null;
  supplierId: string | null;
  /** Categoría resuelta por el loader para RECEIVED (líneas → cuentas). */
  categoryId: string | null;
  name: string;
  /** ISSUED con paymentStatus=CEDED — marca secundaria tras conciliar. */
  ceded?: boolean;
}

export interface RealArgs {
  rows: FlowRowRef[];
  weeks: string[];
  txs: RealTxInput[];
  dteById: Map<string, DteRefInput>;
  /** accountPlanId → categoryId (mapeo FinanceCashflowCategoryAccount). */
  categoryIdByAccountPlanId: Map<string, string>;
  categoryCodeById: Map<string, string>;
}

/** Atajos payroll idénticos a category-resolver.ts (convención de producto). */
const PAYROLL_LINK_CODE: Record<string, string> = {
  PAYROLL_LIQUIDACION: "EGR_SUELDO",
  PAYROLL_ANTICIPO: "EGR_QUINCENA",
  TE_LOTE: "EGR_TURNO_EXTRA",
  TE_ITEM: "EGR_TURNO_EXTRA",
  TE_TURNO: "EGR_TURNO_EXTRA",
};

/**
 * Links de diferencia contable (shortfall/surplus) que NO consumen el cupo
 * del monto bancario. En abonos: EXPENSE/INCOME con cuenta. En cargos:
 * INCOME con cuenta (descuento recibido en shortfall de egreso).
 */
function isAccountingDiffLink(isCredit: boolean, link: RealLinkInput): boolean {
  if (!link.accountPlanId) return false;
  if (isCredit) {
    return link.targetType === "EXPENSE" || link.targetType === "INCOME";
  }
  return link.targetType === "INCOME";
}

function findCostoFactoringRowId(rows: FlowRowRef[]): string | null {
  const key = normalizeRowName(COST_FACTORING_ROW_NAME);
  for (const r of rows) {
    if (normalizeRowName(r.name) !== key) continue;
    if (r.section != null && r.section !== "FINANCIAMIENTO") continue;
    return r.id;
  }
  return null;
}

export function deriveReal(args: RealArgs): RealByRow {
  const out: RealByRow = new Map();
  if (args.weeks.length === 0) return out;
  const firstWeek = args.weeks[0];
  const lastWeek = args.weeks[args.weeks.length - 1];
  const matchIncome = buildIncomeMatcher(args.rows);
  const idx = buildExpenseIndexes(args.rows, args.categoryCodeById);
  const costoFactoringRowId = findCostoFactoringRowId(args.rows);

  const resolveExpenseLinkRow = (link: RealLinkInput): string => {
    const payrollCode = PAYROLL_LINK_CODE[link.targetType];
    if (payrollCode) return matchExpenseRow(idx, { categoryCode: payrollCode });
    if (link.targetType === "DTE_RECEIVED" && link.targetId) {
      const dte = args.dteById.get(link.targetId);
      if (dte) {
        return matchExpenseRow(idx, {
          supplierId: dte.supplierId,
          categoryId: dte.categoryId,
        });
      }
    }
    if (link.accountPlanId) {
      const catId = args.categoryIdByAccountPlanId.get(link.accountPlanId);
      if (catId) return matchExpenseRow(idx, { categoryId: catId });
    }
    return UNMATCHED_EXPENSE_KEY;
  };

  for (const tx of args.txs) {
    const week = weekStartYmd(ymdToDate(tx.dateYmd) ?? new Date());
    if (week < firstWeek || week > lastWeek) continue;
    const isCredit = tx.amountClp > 0;
    const txMagnitude = Math.abs(tx.amountClp);

    let assigned = 0;
    for (const link of tx.links) {
      if (isAccountingDiffLink(isCredit, link)) continue;

      const monto = Math.min(Math.abs(link.amountClp), txMagnitude - assigned);
      if (monto <= 0) continue;
      assigned += monto;

      if (isCredit) {
        // Anticipo de cesión: la factura ya está en committed/cedida.
        if (link.targetType === "FACTORING_OPERATION") continue;

        if (link.targetType === "DTE_ISSUED" && link.targetId) {
          const dte = args.dteById.get(link.targetId);
          if (!dte) continue;
          const rowKey = matchIncome(
            dte.crmAccountId,
            dte.installationId,
            dte.recurringTemplateId,
          );
          // Sin fila de programación/cuenta → no inventar Otros ingresos.
          if (rowKey === UNMATCHED_INCOME_KEY) continue;
          pushReal(out, rowKey, week, {
            bankTransactionId: tx.id,
            folio: dte.folio,
            dteId: link.targetId,
            label: dte.name || tx.description,
            fecha: tx.dateYmd,
            monto: Math.round(monto),
            ceded: dte.ceded === true,
          });
        }
        // Cualquier otro link de abono: no auto-rutea a bandeja.
        continue;
      }

      // Cargos: ruteo clásico a fila de egreso / Otros egresos.
      const dte = link.targetId ? args.dteById.get(link.targetId) : undefined;
      pushReal(out, resolveExpenseLinkRow(link), week, {
        bankTransactionId: tx.id,
        folio: dte?.folio,
        dteId: link.targetType.startsWith("DTE") ? (link.targetId ?? undefined) : undefined,
        label: dte?.name ?? tx.description,
        fecha: tx.dateYmd,
        monto: -Math.round(monto),
      });
    }

    // Merma de factoring (y diffs contables) — fuera del cupo bancario.
    for (const link of tx.links) {
      if (!isAccountingDiffLink(isCredit, link)) continue;
      const monto = Math.round(Math.abs(link.amountClp));
      if (monto <= 0) continue;

      if (isCredit && link.targetType === "EXPENSE") {
        const rowKey = costoFactoringRowId;
        if (!rowKey) continue;
        pushReal(out, rowKey, week, {
          bankTransactionId: tx.id,
          label: `Costo factoring · ${tx.description}`.slice(0, 200),
          fecha: tx.dateYmd,
          monto: -monto,
        });
        continue;
      }

      // Surplus INCOME en abono: no auto-ingreso (Otros ingresos es manual).
      // Shortfall INCOME en cargo: descuento → Otros egresos o categoría.
      if (!isCredit && link.targetType === "INCOME") {
        const rowKey = resolveExpenseLinkRow(link);
        pushReal(out, rowKey, week, {
          bankTransactionId: tx.id,
          label: tx.description,
          fecha: tx.dateYmd,
          // Descuento en egreso = reduce el cargo → monto positivo en caja.
          monto: Math.round(monto),
        });
      }
    }

    // Remanente sin conciliar: solo egresos → Otros egresos.
    // Abonos huérfanos NO van a Otros ingresos (fila manual).
    const remainder = txMagnitude - assigned;
    if (remainder > 0.5 && !isCredit) {
      pushReal(out, UNMATCHED_EXPENSE_KEY, week, {
        bankTransactionId: tx.id,
        label: tx.description,
        fecha: tx.dateYmd,
        monto: -Math.round(remainder),
      });
    }
  }

  return out;
}
