/**
 * Auto-Match de pagos de turnos extras contra OpsPagoTeItem pendientes.
 *
 * Los turnos extras se pagan típicamente por transferencia a la cuenta
 * del guardia, sin marca distintiva en glosa salvo el RUT. Este servicio
 * busca, para cada movimiento bancario de egreso, un item de planilla
 * (OpsPagoTeItem) sin paidAt cuyo monto y RUT del guardia calcen exacto.
 *
 * Reglas (Nivel A — match contra planilla cargada):
 *
 *   1. Bank tx debe ser EGRESO (amount < 0). Pagos a guardia salen de
 *      cuenta de la empresa, nunca son ingreso.
 *   2. La glosa NO puede contener "TGR" / "TESORERIA" — esos son
 *      finiquitos pagados a la Tesorería General de la República.
 *   3. Buscar OpsPagoTeItem con paid_at IS NULL y amount_clp = |amount|
 *      EXACTO (turnos extras pueden ir de $3k a $300k según acumulación,
 *      no se usa rango como filtro).
 *   4. De los candidatos, retener solo aquellos cuyo guardia.persona.rut
 *      aparezca en description/reference de la bank tx.
 *   5. Descarte de sueldo: si existe un PayrollLiquidacion del mismo
 *      guardia con paidAt en ±7d y netSalary ≈ |amount| (±2%), el pago
 *      es probablemente un sueldo, no un turno extra → descartar.
 *   6. Ventana de fecha: weekStart del lote − 7d ≤ transactionDate ≤
 *      weekStart + 90d (los lotes se pagan hasta 3 meses después).
 *   7. Si queda EXACTAMENTE 1 candidato → match.
 *      Si quedan varios del mismo guardia/monto → ambiguous (revisar).
 *      Si quedan 0 → no_candidate.
 *
 * Acciones del match:
 *   - Crear FinanceBankTransactionLink targetType=TE_ITEM, targetId=item.id.
 *   - Marcar item.paidAt = transactionDate, item.status = "paid".
 *   - Marcar turnoExtra.paidAt = transactionDate.
 *   - Si todos los items del lote están pagados → lote.paidAt + status=paid.
 *   - Marcar bankTx.reconciliationStatus = MATCHED.
 *
 * Idempotencia: si la bank tx ya está MATCHED, sale temprano sin tocar.
 */
import { prisma } from "@/lib/prisma";
import { Decimal } from "@prisma/client/runtime/library";
import { rutAppearsInText } from "./auto-match-payment.service";

export interface AutoMatchTurnoExtraResult {
  matched: boolean;
  /**
   * Razón del NO-match. Solo presente cuando matched=false.
   *   - already_matched: bank tx ya conciliada.
   *   - not_egress: amount > 0, no aplica.
   *   - skipped_test_amount: amount = 0.
   *   - tgr_payment: pago a Tesorería (finiquito), no TE.
   *   - no_candidate: ningún item pendiente con ese monto + RUT.
   *   - ambiguous: múltiples items posibles, requiere revisión.
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
  pagoTeItemId?: string;
  turnoExtraId?: string;
  guardiaId?: string;
  loteId?: string;
  candidateIds?: string[];
}

/**
 * Detecta si la glosa del banco apunta a pago a Tesorería General de la
 * República (finiquitos típicamente). El usuario confirmó que los
 * finiquitos se pagan a TGR, no directo al RUT del guardia.
 */
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

/**
 * Heurística "el monto parece sueldo de este guardia". Si en ±7d existe
 * un PayrollLiquidacion del mismo guardia con netSalary cercano (±2%),
 * el pago probablemente es sueldo, no turno extra. Conservador: tolera
 * 2% de diferencia para descontar reajustes/redondeos.
 */
async function looksLikeSalaryPayment(
  guardiaId: string,
  amountClp: number,
  transactionDate: Date,
): Promise<boolean> {
  const minDate = new Date(transactionDate);
  minDate.setDate(minDate.getDate() - 7);
  const maxDate = new Date(transactionDate);
  maxDate.setDate(maxDate.getDate() + 7);
  const liq = await prisma.payrollLiquidacion.findFirst({
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
      // Pagos a guardia son egresos. Ingresos no aplican a este matcher.
      return { matched: false, reason: "not_egress" as const };
    }

    if (looksLikeTgrPayment(bankTx.description, bankTx.reference)) {
      return { matched: false, reason: "tgr_payment" as const };
    }

    const amountAbs = Math.abs(amountNum);

    // Candidatos por monto exacto + pendientes. Incluimos lote y guardia
    // con persona en una sola query para evitar N+1 en el matching de RUT.
    const candidates = await tx.opsPagoTeItem.findMany({
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

    if (candidates.length === 0) {
      return { matched: false, reason: "no_candidate" as const };
    }

    // Filtro 1: RUT del guardia debe aparecer en glosa del banco.
    const withRut = candidates.filter((c) =>
      rutAppearsInText(c.guardia.persona.rut, bankTx.description, bankTx.reference),
    );
    if (withRut.length === 0) {
      return { matched: false, reason: "no_candidate" as const };
    }

    // Filtro 2: ventana de fecha del lote (weekStart − 7d, weekStart + 90d).
    const txDate = bankTx.transactionDate;
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

    // Filtro 3: descarte "parece sueldo". Si CUALQUIER candidato tiene un
    // sueldo cercano por monto, descartamos toda la tx — es seguro que el
    // contador prefiere revisar a equivocar un sueldo con un turno extra.
    // Evaluamos contra el primer candidato (mismo monto/fecha, el guardia
    // distinto no cambia la materialidad de la heurística).
    if (
      await looksLikeSalaryPayment(inWindow[0].guardiaId, amountAbs, txDate)
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

    // Crear link TE_ITEM → ítem específico de planilla.
    await tx.financeBankTransactionLink.create({
      data: {
        tenantId,
        bankTransactionId: bankTx.id,
        targetType: "TE_ITEM",
        targetId: chosen.id,
        amount: new Decimal(amountAbs),
        accountPlanId: null,
        note: "Auto-match turno extra por RUT + monto exacto",
        createdById: userId,
      },
    });

    // Marcar item + turno extra como pagados con la fecha del banco.
    await tx.opsPagoTeItem.update({
      where: { id: chosen.id },
      data: { paidAt: txDate, status: "paid" },
    });
    await tx.opsTurnoExtra.update({
      where: { id: chosen.turnoExtraId },
      data: { paidAt: txDate },
    });

    // Si todos los items del lote están pagados, cerrar el lote.
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
    };
  });
}
