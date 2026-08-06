/**
 * Cascada de identidad (nómina / finiquito / inferencia Turnos extra)
 * para el motor de auto-conciliación. Solo egresos con RUT de guardia.
 *
 * Calce exacto → concilia (PAYROLL | FINIQUITO).
 * Guardia sin calce → sugerencia «Por autorizar» (nunca auto-concilia).
 */
import "server-only";
import { prisma } from "@/lib/prisma";
import { Decimal } from "@prisma/client/runtime/library";
import { recognizeRutsForTransactions } from "./rut-recognition.service";
import { loadPayrollCandidates } from "./payroll-candidates.service";
import { resolvePayrollFlowRows } from "./classify-flow-rows";
import { resolveAccountPlanIdForFlowRow } from "./flow-row-account-plan.service";
import type { PayrollCandidate } from "./payroll-candidates.service";

const PAYROLL_WINDOW_DAYS = 120;
const DEFAULT_TOLERANCE_CLP = 5000;

function amountMatches(
  candidateAmount: number,
  amountAbs: number,
  tol: number,
): boolean {
  return Math.abs(candidateAmount - amountAbs) <= tol;
}

function pickCandidate(
  candidates: PayrollCandidate[],
  kind: PayrollCandidate["kind"],
  amountAbs: number,
  tol: number,
): PayrollCandidate | null {
  const hits = candidates.filter(
    (c) => c.kind === kind && amountMatches(c.amount, amountAbs, tol),
  );
  return hits[0] ?? null;
}

export interface PayrollCascadeSummary {
  payrollMatched: number;
  finiquitoMatched: number;
  inferredSuggested: number;
  errors: { bankTransactionId: string; message: string }[];
}

/**
 * Fallback 3 del motor: sobre txs que llegaron sin match DTE/TE/regla.
 * Carga candidatos de nómina **una vez** por lote.
 */
export async function tryPayrollCascade(
  tenantId: string,
  bankTransactionIds: string[],
  userId: string,
): Promise<PayrollCascadeSummary> {
  const summary: PayrollCascadeSummary = {
    payrollMatched: 0,
    finiquitoMatched: 0,
    inferredSuggested: 0,
    errors: [],
  };
  if (bankTransactionIds.length === 0) return summary;

  const txs = await prisma.financeBankTransaction.findMany({
    where: {
      tenantId,
      id: { in: bankTransactionIds },
      reconciliationStatus: "UNMATCHED",
      hiddenAt: null,
      suggestedRuleId: null,
      suggestedAccountPlanId: null,
    },
    select: {
      id: true,
      amount: true,
      description: true,
      reference: true,
    },
  });

  // Solo egresos
  const egresos = txs.filter((t) => t.amount.toNumber() < 0);
  if (egresos.length === 0) return summary;

  const [rutMap, flowRows, cfg] = await Promise.all([
    recognizeRutsForTransactions(
      tenantId,
      egresos.map((t) => ({
        id: t.id,
        description: t.description,
        reference: t.reference,
      })),
    ),
    resolvePayrollFlowRows(tenantId),
    prisma.financeCashflowConfig.findUnique({
      where: { tenantId },
      select: { matchAmountToleranceClp: true },
    }),
  ]);
  const tol = cfg?.matchAmountToleranceClp ?? DEFAULT_TOLERANCE_CLP;

  const guardiaIds = [
    ...new Set(
      egresos
        .map((t) => {
          const r = rutMap.get(t.id);
          return r?.kind === "guardia" ? r.entityId : null;
        })
        .filter((id): id is string => !!id),
    ),
  ];

  const candidatesByGuardia = await loadPayrollCandidates(
    tenantId,
    guardiaIds,
    PAYROLL_WINDOW_DAYS,
  );

  // Account plans de filas (una vez)
  const rowAccountCache = new Map<string, string | null>();
  async function accountForRow(
    row: { flowRowId: string; label: string } | null,
  ): Promise<string | null> {
    if (!row) return null;
    if (rowAccountCache.has(row.flowRowId)) {
      return rowAccountCache.get(row.flowRowId) ?? null;
    }
    const full = await prisma.financeFlowRow.findFirst({
      where: { id: row.flowRowId, tenantId },
      select: { id: true, categoryId: true },
    });
    const ap = full
      ? await resolveAccountPlanIdForFlowRow(tenantId, full)
      : null;
    rowAccountCache.set(row.flowRowId, ap);
    return ap;
  }

  for (const tx of egresos) {
    try {
      const rec = rutMap.get(tx.id);
      if (!rec || rec.kind !== "guardia" || !rec.entityId) continue;

      const amountAbs = Math.abs(tx.amount.toNumber());
      const candidates = candidatesByGuardia.get(rec.entityId) ?? [];

      const liq = pickCandidate(candidates, "LIQUIDACION", amountAbs, tol);
      if (liq) {
        const accountPlanId = await accountForRow(flowRows.liquidacionRow);
        await prisma.$transaction([
          prisma.financeBankTransactionLink.create({
            data: {
              tenantId,
              bankTransactionId: tx.id,
              targetType: "PAYROLL_LIQUIDACION",
              targetId: liq.refId,
              amount: new Decimal(amountAbs),
              accountPlanId,
              note: `Auto-match nómina: ${liq.label}`,
              matchSource: "PAYROLL",
              createdById: userId,
            },
          }),
          prisma.financeBankTransaction.update({
            where: { id: tx.id },
            data: { reconciliationStatus: "MATCHED" },
          }),
          prisma.payrollLiquidacion.update({
            where: { id: liq.refId },
            data: { paidAt: new Date() },
          }),
        ]);
        summary.payrollMatched += 1;
        continue;
      }

      const ant = pickCandidate(candidates, "ANTICIPO", amountAbs, tol);
      if (ant) {
        const accountPlanId = await accountForRow(flowRows.anticipoRow);
        await prisma.$transaction([
          prisma.financeBankTransactionLink.create({
            data: {
              tenantId,
              bankTransactionId: tx.id,
              targetType: "PAYROLL_ANTICIPO",
              targetId: ant.refId,
              amount: new Decimal(amountAbs),
              accountPlanId,
              note: `Auto-match nómina: ${ant.label}`,
              matchSource: "PAYROLL",
              createdById: userId,
            },
          }),
          prisma.financeBankTransaction.update({
            where: { id: tx.id },
            data: { reconciliationStatus: "MATCHED" },
          }),
          prisma.payrollAnticipoItem.update({
            where: { id: ant.refId },
            data: { status: "PAID", paidAt: new Date() },
          }),
        ]);
        summary.payrollMatched += 1;
        continue;
      }

      const fin = pickCandidate(candidates, "FINIQUITO", amountAbs, tol);
      if (fin) {
        const accountPlanId = await accountForRow(flowRows.finiquitoRow);
        await prisma.$transaction([
          prisma.financeBankTransactionLink.create({
            data: {
              tenantId,
              bankTransactionId: tx.id,
              targetType: "EXPENSE",
              targetId: null,
              amount: new Decimal(amountAbs),
              accountPlanId,
              note: `Auto-match finiquito: ${fin.label}`,
              matchSource: "FINIQUITO",
              createdById: userId,
            },
          }),
          prisma.financeBankTransaction.update({
            where: { id: tx.id },
            data: { reconciliationStatus: "MATCHED" },
          }),
        ]);
        summary.finiquitoMatched += 1;
        continue;
      }

      // Inferencia: guardia sin calce → Turnos extra, solo sugerencia
      const teAccount = await accountForRow(flowRows.teRow);
      if (teAccount) {
        await prisma.financeBankTransaction.update({
          where: { id: tx.id },
          data: { suggestedAccountPlanId: teAccount },
        });
        summary.inferredSuggested += 1;
      }
    } catch (err) {
      summary.errors.push({
        bankTransactionId: tx.id,
        message: err instanceof Error ? err.message : "Error en cascada nómina",
      });
    }
  }

  return summary;
}
