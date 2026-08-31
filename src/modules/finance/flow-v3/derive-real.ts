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
 * Egresos (cargos): se rutean por links (DTE recibido, payroll, cuenta);
 * el remanente sin conciliar sigue yendo a "Otros egresos".
 */
import { weekStartYmd, ymdToDate } from "./weeks";
import {
  buildExpenseIndexes,
  buildIncomeMatcher,
  matchExpenseRow,
  normalizeRowName,
} from "./row-match";
import { payrollLinkKeys } from "./row-keys";
import { COST_FACTORING_ROW_NAME } from "./canonical-rows";
import {
  hasPartnerSocioPair,
  resolvePartnerSocioRow,
  type PartnerRouteCandidate,
} from "./partner-account-route";
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
  /**
   * Fila de planilla elegida al clasificar. Gana sobre el ruteo por
   * cuenta (Acreedores Varios compartido entre Aporte/Devolución/Retiro).
   */
  flowRowId?: string | null;
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
  /** Destino explícito elegido al emitir. null/undefined = ruteo automático. */
  flowRouting?: "OWN_ROW" | "OTHER_INCOME" | null;
  supplierId: string | null;
  /** Primera cuenta de líneas del DTE recibido (loader). */
  accountPlanId?: string | null;
  /** @deprecated Preferir accountPlanId. */
  categoryId?: string | null;
  name: string;
  /** ISSUED con paymentStatus=CEDED — marca secundaria tras conciliar. */
  ceded?: boolean;
}

export interface RealArgs {
  rows: FlowRowRef[];
  weeks: string[];
  txs: RealTxInput[];
  dteById: Map<string, DteRefInput>;
  /** accountPlanId → rowId (destino por defecto vía FinanceFlowRowAccount). */
  accountToRowId: Map<string, string>;
  /**
   * accountPlanId → todos los renglones que la tienen. Permite polaridad
   * aporte(+)/devolución(−) cuando comparten Acreedores Varios.
   */
  accountToRowCandidates?: Map<string, PartnerRouteCandidate[]>;
}

/**
 * Links de diferencia contable (shortfall/surplus) que NO consumen el cupo
 * del monto bancario. En abonos: EXPENSE (merma factoring) sigue siendo diff;
 * INCOME con cuenta de aporte socios SÍ consume cupo (inyección de caja).
 * En cargos: INCOME con cuenta (descuento recibido en shortfall de egreso).
 */
function isAccountingDiffLink(
  isCredit: boolean,
  link: RealLinkInput,
  accountToRowCandidates?: Map<string, PartnerRouteCandidate[]>,
): boolean {
  if (!link.accountPlanId) return false;
  if (isCredit) {
    if (link.targetType === "EXPENSE") return true;
    if (link.targetType === "INCOME") {
      // Préstamo/aporte de socio: el abono debe aterrizar en la planilla.
      const cands = accountToRowCandidates?.get(link.accountPlanId);
      if (hasPartnerSocioPair(cands) && resolvePartnerSocioRow(cands, true)) {
        return false;
      }
      return true;
    }
    return false;
  }
  return link.targetType === "INCOME";
}

function findCostoFactoringRowId(rows: FlowRowRef[]): string | null {
  for (const r of rows) {
    if (r.canonicalKey === "FACTORING") return r.id;
  }
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
  const idx = buildExpenseIndexes(args.rows, args.accountToRowId);
  const costoFactoringRowId = findCostoFactoringRowId(args.rows);
  const candidates = args.accountToRowCandidates;

  const rowIds = new Set(args.rows.map((r) => r.id));
  const explicitRow = (link: RealLinkInput): string | null => {
    if (link.flowRowId && rowIds.has(link.flowRowId)) return link.flowRowId;
    return null;
  };

  const partnerRowFor = (accountPlanId: string | null | undefined, isCredit: boolean): string | null => {
    if (!accountPlanId || !candidates) return null;
    return resolvePartnerSocioRow(candidates.get(accountPlanId), isCredit);
  };

  const resolveExpenseLinkRow = (link: RealLinkInput): string => {
    const chosen = explicitRow(link);
    if (chosen) return chosen;
    const payrollKeys = payrollLinkKeys(link.targetType);
    if (payrollKeys.length > 0) return matchExpenseRow(idx, { canonicalKeys: payrollKeys });
    if (link.targetType === "DTE_RECEIVED" && link.targetId) {
      const dte = args.dteById.get(link.targetId);
      if (dte) {
        return matchExpenseRow(idx, {
          supplierId: dte.supplierId,
          accountPlanId: dte.accountPlanId ?? null,
        });
      }
    }
    if (link.accountPlanId) {
      const partner = partnerRowFor(link.accountPlanId, false);
      if (partner) return partner;
      return matchExpenseRow(idx, { accountPlanId: link.accountPlanId });
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
      if (isAccountingDiffLink(isCredit, link, candidates)) continue;

      const monto = Math.min(Math.abs(link.amountClp), txMagnitude - assigned);
      if (monto <= 0) continue;
      assigned += monto;

      if (isCredit) {
        // Anticipo de cesión: la factura ya está en committed/cedida.
        if (link.targetType === "FACTORING_OPERATION") continue;

        const chosenIncome = explicitRow(link);
        if (
          chosenIncome &&
          (link.targetType === "INCOME" || link.targetType === "EXPENSE")
        ) {
          pushReal(out, chosenIncome, week, {
            bankTransactionId: tx.id,
            label: tx.description,
            fecha: tx.dateYmd,
            monto: Math.round(monto),
          });
          continue;
        }

        if (link.targetType === "DTE_ISSUED" && link.targetId) {
          const dte = args.dteById.get(link.targetId);
          if (!dte) continue;
          // Destino explícito OTHER_INCOME → fila canónica "Otros ingresos".
          const forcedOther = dte.flowRouting === "OTHER_INCOME";
          const rowKey = forcedOther
            ? UNMATCHED_INCOME_KEY
            : matchIncome(
                dte.crmAccountId,
                dte.installationId,
                dte.recurringTemplateId,
              );
          // Sin fila de programación/cuenta → no inventar Otros ingresos
          // (salvo decisión explícita OTHER_INCOME al emitir).
          if (rowKey === UNMATCHED_INCOME_KEY && !forcedOther) continue;
          pushReal(out, rowKey, week, {
            bankTransactionId: tx.id,
            folio: dte.folio,
            dteId: link.targetId,
            label: dte.name || tx.description,
            fecha: tx.dateYmd,
            monto: Math.round(monto),
            ceded: dte.ceded === true,
          });
          continue;
        }

        // Abono clasificado a cuenta de aporte socios → Aporte socios (+).
        if (link.targetType === "INCOME" && link.accountPlanId) {
          const partner = partnerRowFor(link.accountPlanId, true);
          if (partner) {
            pushReal(out, partner, week, {
              bankTransactionId: tx.id,
              label: tx.description,
              fecha: tx.dateYmd,
              monto: Math.round(monto),
            });
          }
        }
        // Cualquier otro link de abono: no auto-rutea a bandeja.
        continue;
      }

      // Cargos: ruteo clásico a fila de egreso / Otros egresos.
      // Acreedores Varios en cargo → Devolución a socios (−).
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
      if (!isAccountingDiffLink(isCredit, link, candidates)) continue;
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
