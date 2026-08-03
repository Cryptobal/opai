/**
 * Derivador REAL (función pura, cero writes).
 *
 * Movimientos bancarios visibles del rango → semana del movimiento (fecha del
 * abono/cargo, NO la planificada). El ruteo a fila usa los links de
 * conciliación; el movimiento SIN links (o el remanente no asignado) cae en
 * "Otros" del signo correspondiente — así el saldo real de la planilla nunca
 * pierde plata aunque la conciliación esté incompleta.
 */
import { weekStartYmd, ymdToDate } from "./weeks";
import {
  buildExpenseIndexes,
  buildIncomeMatcher,
  matchExpenseRow,
} from "./row-match";
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

export function deriveReal(args: RealArgs): RealByRow {
  const out: RealByRow = new Map();
  if (args.weeks.length === 0) return out;
  const firstWeek = args.weeks[0];
  const lastWeek = args.weeks[args.weeks.length - 1];
  const matchIncome = buildIncomeMatcher(args.rows);
  const idx = buildExpenseIndexes(args.rows, args.categoryCodeById);

  const resolveLinkRow = (isCredit: boolean, link: RealLinkInput): string => {
    if (isCredit) {
      if (link.targetType === "DTE_ISSUED" && link.targetId) {
        const dte = args.dteById.get(link.targetId);
        if (dte) {
          return matchIncome(dte.crmAccountId, dte.installationId, dte.recurringTemplateId);
        }
      }
      return UNMATCHED_INCOME_KEY;
    }
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
      const monto = Math.min(Math.abs(link.amountClp), txMagnitude - assigned);
      if (monto <= 0) continue;
      assigned += monto;
      const dte = link.targetId ? args.dteById.get(link.targetId) : undefined;
      pushReal(out, resolveLinkRow(isCredit, link), week, {
        bankTransactionId: tx.id,
        folio: dte?.folio,
        dteId: link.targetType.startsWith("DTE") ? (link.targetId ?? undefined) : undefined,
        label: dte?.name ?? tx.description,
        fecha: tx.dateYmd,
        // Signado por dirección de caja: + abono / − cargo.
        monto: isCredit ? Math.round(monto) : -Math.round(monto),
      });
    }

    // Remanente sin conciliar (o movimiento sin links) → "Otros".
    const remainder = txMagnitude - assigned;
    if (remainder > 0.5) {
      pushReal(out, isCredit ? UNMATCHED_INCOME_KEY : UNMATCHED_EXPENSE_KEY, week, {
        bankTransactionId: tx.id,
        label: tx.description,
        fecha: tx.dateYmd,
        monto: isCredit ? Math.round(remainder) : -Math.round(remainder),
      });
    }
  }

  return out;
}
