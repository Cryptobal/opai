/**
 * Auto-Match de pagos de turnos extras: planilla TE (OpsPagoTeItem) y, si no
 * hay fila pendiente con ese monto, TE operativo aprobado (OpsTurnoExtra).
 *
 * Reglas nivel A — match contra planilla cargada (OpsPagoTeItem):
 *
 *   1. Bank tx EGRESO (amount < 0).
 *   2. Glosa sin TGR/Tesorería (finiquitos).
 *   3. OpsPagoTeItem pendiente (paidAt null) con amount_clp = |amount| exacto.
 *   4. RUT del guardia en description/reference (dígitos flexibles).
 *   5. Fecha: weekStart del lote −7d … weekStart +90d.
 *   6. Descarte sueldo: liquidación del mismo guardia en ±7d con neto ≈ monto.
 *   7. Un solo candidato en ventana → match TE_ITEM + item + turno + lote.
 *
 * Reglas nivel B — sin OpsPagoTeItem pendiente con ese monto (pagos “fuera de lote”):
 *
 *   1. |amount| < $300.000 (heurística: TE; montos mayores siguen solo por planilla).
 *   2. OpsTurnoExtra approved, paidAt null, amount_clp = |amount|.
 *   3. Misma lógica de RUT en glosa + cuerpo de RUT persona natural (< 30M).
 *   4. Fecha movimiento entre fecha del turno −7d y +120d.
 *   5. Mismo descarte “parece sueldo”.
 *   6. Un solo TE candidato → link TE_TURNO + paidAt en OpsTurnoExtra.
 *
 * Si existe al menos un OpsPagoTeItem pendiente con ese monto, NO se usa el
 * nivel B (evita duplicar cuando la planilla está en juego pero falló RUT/fecha).
 */
import { prisma } from "@/lib/prisma";
import { Decimal } from "@prisma/client/runtime/library";
import {
  isNaturalPersonRutBody,
  rutAppearsInText,
} from "./auto-match-payment.service";

/** Monto máximo exclusivo para auto-match directo a OpsTurnoExtra sin planilla. */
export const TE_ORPHAN_AUTO_MATCH_MAX_EXCL_CLP = 300_000;

export interface AutoMatchTurnoExtraResult {
  matched: boolean;
  /**
   * Razón del NO-match. Solo presente cuando matched=false.
   *   - already_matched: bank tx ya conciliada.
   *   - not_egress: amount > 0, no aplica.
   *   - skipped_test_amount: amount = 0.
   *   - tgr_payment: pago a Tesorería (finiquito), no TE.
   *   - no_candidate: ningún item/TE válido.
   *   - ambiguous: múltiples candidatos, requiere revisión.
   *   - looks_like_salary: existe liquidación con paidAt y monto similar.
   */
  reason?:
    | "already_matched"
    | "not_egress"
    | "skipped_test_amount"
    | "tgr_payment"
    | "no_candidate"
    | "ambiguous"
    | "looks_like_salary";
  /** Match vía planilla TE. */
  pagoTeItemId?: string;
  /** Siempre el turno extra operativo afectado (planilla u orphan). */
  turnoExtraId?: string;
  guardiaId?: string;
  loteId?: string;
  candidateIds?: string[];
  /** true cuando el match fue por OpsTurnoExtra sin fila de planilla. */
  matchedOrphanTurno?: boolean;
}

function looksLikeTgrPayment(...texts: (string | null | undefined)[]): boolean {
  for (const t of texts) {
    if (!t) continue;
    const upper = t.toUpperCase();
    if (upper.includes("TGR")) return true;
    if (upper.includes("TESORERIA")) return true;
    if (upper.includes("TESORERÍA")) return true;
  }
  return false;
}

type PrismaTx = Parameters<Parameters<typeof prisma.$transaction>[0]>[0];

async function looksLikeSalaryPayment(
  tx: PrismaTx,
  guardiaId: string,
  amountClp: number,
  transactionDate: Date,
): Promise<boolean> {
  const minDate = new Date(transactionDate);
  minDate.setDate(minDate.getDate() - 7);
  const maxDate = new Date(transactionDate);
  maxDate.setDate(maxDate.getDate() + 7);
  const liq = await tx.payrollLiquidacion.findFirst({
    where: {
      guardiaId,
      status: { in: ["APPROVED", "PAID"] },
      paidAt: { gte: minDate, lte: maxDate },
    },
    select: { netSalary: true },
  });
  if (!liq) return false;
  const net = liq.netSalary.toNumber();
  if (net <= 0) return false;
  const diff = Math.abs(net - amountClp) / net;
  return diff <= 0.02;
}

function bankTxDateInTurnoPaymentWindow(turnoDate: Date, transactionDate: Date): boolean {
  const base = new Date(turnoDate);
  base.setHours(0, 0, 0, 0);
  const minDate = new Date(base);
  minDate.setDate(minDate.getDate() - 7);
  const maxDate = new Date(base);
  maxDate.setDate(maxDate.getDate() + 120);
  const txD = new Date(transactionDate);
  txD.setHours(0, 0, 0, 0);
  return txD >= minDate && txD <= maxDate;
}

export async function tryAutoMatchBankTransactionToTurnoExtra(
  tenantId: string,
  bankTransactionId: string,
  userId: string,
): Promise<AutoMatchTurnoExtraResult> {
  return prisma.$transaction(async (tx) => {
    const bankTx = await tx.financeBankTransaction.findFirst({
      where: { id: bankTransactionId, tenantId },
      select: {
        id: true,
        bankAccountId: true,
        transactionDate: true,
        description: true,
        reference: true,
        amount: true,
        reconciliationStatus: true,
      },
    });
    if (!bankTx) return { matched: false, reason: "no_candidate" as const };

    if (bankTx.reconciliationStatus !== "UNMATCHED") {
      return { matched: false, reason: "already_matched" as const };
    }

    const amountNum = bankTx.amount.toNumber();
    if (amountNum === 0) {
      return { matched: false, reason: "skipped_test_amount" as const };
    }
    if (amountNum > 0) {
      return { matched: false, reason: "not_egress" as const };
    }

    if (looksLikeTgrPayment(bankTx.description, bankTx.reference)) {
      return { matched: false, reason: "tgr_payment" as const };
    }

    const amountAbs = Math.abs(amountNum);
    const txDate = bankTx.transactionDate;

    const planillaCandidates = await tx.opsPagoTeItem.findMany({
      where: {
        tenantId,
        paidAt: null,
        amountClp: new Decimal(amountAbs),
      },
      select: {
        id: true,
        loteId: true,
        turnoExtraId: true,
        guardiaId: true,
        amountClp: true,
        lote: {
          select: {
            id: true,
            status: true,
            weekStart: true,
            weekEnd: true,
          },
        },
        guardia: {
          select: {
            id: true,
            persona: { select: { rut: true } },
          },
        },
      },
    });

    if (planillaCandidates.length > 0) {
      const withRut = planillaCandidates.filter((c) =>
        rutAppearsInText(c.guardia.persona.rut, bankTx.description, bankTx.reference),
      );
      if (withRut.length === 0) {
        return { matched: false, reason: "no_candidate" as const };
      }

      const inWindow = withRut.filter((c) => {
        const minDate = new Date(c.lote.weekStart);
        minDate.setDate(minDate.getDate() - 7);
        const maxDate = new Date(c.lote.weekStart);
        maxDate.setDate(maxDate.getDate() + 90);
        return txDate >= minDate && txDate <= maxDate;
      });
      if (inWindow.length === 0) {
        return { matched: false, reason: "no_candidate" as const };
      }

      if (
        await looksLikeSalaryPayment(tx, inWindow[0].guardiaId, amountAbs, txDate)
      ) {
        return { matched: false, reason: "looks_like_salary" as const };
      }

      if (inWindow.length > 1) {
        return {
          matched: false,
          reason: "ambiguous" as const,
          candidateIds: inWindow.map((c) => c.id),
        };
      }

      const chosen = inWindow[0];

      await tx.financeBankTransactionLink.create({
        data: {
          tenantId,
          bankTransactionId: bankTx.id,
          targetType: "TE_ITEM",
          targetId: chosen.id,
          amount: new Decimal(amountAbs),
          accountPlanId: null,
          note: "Auto-match turno extra por RUT + monto exacto (planilla TE)",
          createdById: userId,
        },
      });

      await tx.opsPagoTeItem.update({
        where: { id: chosen.id },
        data: { paidAt: txDate, status: "paid" },
      });
      await tx.opsTurnoExtra.update({
        where: { id: chosen.turnoExtraId },
        data: { paidAt: txDate },
      });

      const pendingInLote = await tx.opsPagoTeItem.count({
        where: { loteId: chosen.loteId, paidAt: null },
      });
      if (pendingInLote === 0) {
        await tx.opsPagoTeLote.update({
          where: { id: chosen.loteId },
          data: { status: "paid", paidAt: txDate },
        });
      }

      await tx.financeBankTransaction.update({
        where: { id: bankTx.id },
        data: { reconciliationStatus: "MATCHED" },
      });

      return {
        matched: true,
        pagoTeItemId: chosen.id,
        turnoExtraId: chosen.turnoExtraId,
        guardiaId: chosen.guardiaId,
        loteId: chosen.loteId,
        matchedOrphanTurno: false,
      };
    }

    // ── Nivel B: sin ítem de planilla con este monto ──
    if (amountAbs >= TE_ORPHAN_AUTO_MATCH_MAX_EXCL_CLP) {
      return { matched: false, reason: "no_candidate" as const };
    }

    const orphanTurnos = await tx.opsTurnoExtra.findMany({
      where: {
        tenantId,
        paidAt: null,
        status: "approved",
        amountClp: new Decimal(amountAbs),
      },
      select: {
        id: true,
        guardiaId: true,
        date: true,
        installationId: true,
        guardia: {
          select: {
            id: true,
            persona: { select: { rut: true } },
          },
        },
      },
    });

    const withRutOrphan = orphanTurnos.filter(
      (t) =>
        t.guardia.persona.rut &&
        rutAppearsInText(
          t.guardia.persona.rut,
          bankTx.description,
          bankTx.reference,
        ) &&
        isNaturalPersonRutBody(t.guardia.persona.rut),
    );

    if (withRutOrphan.length === 0) {
      return { matched: false, reason: "no_candidate" as const };
    }

    const inWinOrphan = withRutOrphan.filter((t) =>
      bankTxDateInTurnoPaymentWindow(t.date, txDate),
    );
    if (inWinOrphan.length === 0) {
      return { matched: false, reason: "no_candidate" as const };
    }

    if (
      await looksLikeSalaryPayment(tx, inWinOrphan[0].guardiaId, amountAbs, txDate)
    ) {
      return { matched: false, reason: "looks_like_salary" as const };
    }

    if (inWinOrphan.length > 1) {
      return {
        matched: false,
        reason: "ambiguous" as const,
        candidateIds: inWinOrphan.map((t) => t.id),
      };
    }

    const te = inWinOrphan[0];

    await tx.financeBankTransactionLink.create({
      data: {
        tenantId,
        bankTransactionId: bankTx.id,
        targetType: "TE_TURNO",
        targetId: te.id,
        amount: new Decimal(amountAbs),
        accountPlanId: null,
        note: "Auto-match turno extra (TE aprobado sin fila en planilla TE): RUT + monto",
        createdById: userId,
      },
    });

    await tx.opsTurnoExtra.update({
      where: { id: te.id },
      data: { paidAt: txDate },
    });

    await tx.financeBankTransaction.update({
      where: { id: bankTx.id },
      data: { reconciliationStatus: "MATCHED" },
    });

    return {
      matched: true,
      turnoExtraId: te.id,
      guardiaId: te.guardiaId,
      matchedOrphanTurno: true,
    };
  });
}
