/**
 * Auto-Match de pagos contra DTEs emitidos pendientes de cobro.
 *
 * Cuando llega un movimiento bancario (importado de cartola Santander,
 * sync API, manual, etc.), este servicio intenta vincularlo
 * AUTOMÁTICAMENTE con la factura correspondiente. Si encuentra un match
 * EXACTO Y ÚNICO, crea el FinancePaymentRecord + FinancePaymentAllocation
 * y actualiza `paymentStatus` del DTE a PAID. Sin esto el contador tiene
 * que abrir cada movimiento, buscar la factura y marcarla a mano —
 * trabajo repetitivo donde se cuelan errores y los KPIs "Por cobrar"
 * mienten para siempre.
 *
 * Reglas de match (auto_match estricto, decisión del producto):
 *
 *   1. Bank tx debe ser POSITIVA (entrada de plata).
 *   2. monto del DTE debe coincidir EXACTO con el monto absoluto de la
 *      bank tx (sin tolerancia — si difieren $1, el contador decide).
 *   3. EXACTAMENTE 1 candidato en `paymentStatus IN
 *      [UNPAID, PARTIAL, OVERDUE]` con ese monto.
 *   4. Adicionalmente, si el RUT del receptor del DTE aparece en
 *      `description` o `reference` de la bank tx, el match queda
 *      con `confidence=1.0`. Si no aparece pero sigue siendo único
 *      por monto y cae en una ventana de ±15 días desde la emisión,
 *      el match queda con `confidence=0.7` (igual marca PAID, pero
 *      con flag de "revisar"; en una iteración futura podemos
 *      degradarlo a "sugerencia para confirmar").
 *
 * Si NO matchea, queda intacto (`UNMATCHED`) y el usuario lo concilia
 * manualmente desde la UI.
 *
 * Idempotencia: si la bank tx YA está MATCHED o tiene un payment record
 * asociado, el servicio sale temprano sin tocar nada.
 */
import { prisma } from "@/lib/prisma";
import { Decimal } from "@prisma/client/runtime/library";
import { findMatchingRule } from "./automatch-rule.service";

export interface AutoMatchResult {
  matched: boolean;
  /**
   * Razón del NO-match. Solo presente cuando matched=false.
   *   - already_matched: la bank tx ya estaba conciliada.
   *   - negative_amount: bank tx es egreso, no entrada de cobro.
   *   - no_candidate: ningún DTE pendiente con ese monto.
   *   - ambiguous: múltiples DTEs candidatos con el mismo monto.
   *   - skipped_test_amount: monto $0, ignorado por seguridad.
   */
  reason?:
    | "already_matched"
    | "negative_amount"
    | "no_candidate"
    | "ambiguous"
    | "skipped_test_amount";
  dteId?: string;
  paymentRecordId?: string;
  /** "STRICT" si RUT detectado en descripción; "AMOUNT_ONLY" si solo monto. */
  matchType?: "STRICT" | "AMOUNT_ONLY";
  candidateIds?: string[];
}

/**
 * Limpia un RUT chileno a su forma canónica para comparar (solo dígitos
 * y dígito verificador, sin puntos ni guion). Si el input no es válido,
 * devuelve "" en vez de null para simplificar el caller.
 */
export function normalizeRutForMatch(rut: string | null | undefined): string {
  if (!rut) return "";
  return rut.replace(/[^0-9kK]/g, "").toLowerCase();
}

/**
 * Detecta si el RUT del receptor aparece "embebido" en el texto del
 * banco. Bancos chilenos suelen incluir el RUT del pagador o el folio
 * en la descripción. Aceptamos formato con o sin puntos/guion: tanto
 * "12345678-5" como "12.345.678-5" como "123456785" matchean.
 */
export function rutAppearsInText(
  rut: string | null | undefined,
  ...texts: (string | null | undefined)[]
): boolean {
  const norm = normalizeRutForMatch(rut);
  if (norm.length < 7) return false; // RUT chileno mínimo 7 chars
  for (const t of texts) {
    if (!t) continue;
    const tnorm = t.replace(/[^0-9kK]/g, "").toLowerCase();
    if (tnorm.includes(norm)) return true;
  }
  return false;
}

/**
 * Busca una conciliación bancaria activa (status=IN_PROGRESS) que
 * corresponda al período de la bank tx. Si existe, crea el match
 * formal en FinanceReconciliationMatch para que el cierre de mes lo
 * vea integrado. Si no, no hace nada — la auto-match funciona aún si
 * el usuario nunca creó la reconciliación del período.
 */
async function attachToActiveReconciliation(
  tx: Parameters<Parameters<typeof prisma.$transaction>[0]>[0],
  args: {
    tenantId: string;
    bankAccountId: string;
    bankTransactionId: string;
    paymentRecordId: string;
    transactionDate: Date;
    userId: string;
  },
): Promise<void> {
  const reconc = await tx.financeReconciliation.findFirst({
    where: {
      tenantId: args.tenantId,
      bankAccountId: args.bankAccountId,
      periodYear: args.transactionDate.getUTCFullYear(),
      periodMonth: args.transactionDate.getUTCMonth() + 1,
      status: "IN_PROGRESS",
    },
    select: { id: true },
  });
  if (!reconc) return;
  await tx.financeReconciliationMatch.create({
    data: {
      reconciliationId: reconc.id,
      bankTransactionId: args.bankTransactionId,
      paymentRecordId: args.paymentRecordId,
      matchType: "AUTO",
      matchConfidence: new Decimal(1.0),
      createdBy: args.userId,
    },
  });
}

/**
 * Intenta auto-vincular UNA transacción bancaria con un DTE emitido
 * pendiente. Es atómico (transacción) y idempotente.
 *
 * Si encuentra match:
 *   1. Crea FinancePaymentRecord (type=COLLECTION, source=auto).
 *   2. Crea FinancePaymentAllocation contra el DTE.
 *   3. Actualiza el DTE: amountPaid=total, amountPending=0, paymentStatus=PAID.
 *   4. Marca bankTx.reconciliationStatus=MATCHED.
 *   5. Si hay un FinanceReconciliation activo del período, crea match.
 *
 * Si NO matchea: retorna `{matched:false, reason}` sin tocar nada.
 *
 * @param userId — quién creó la importación (para auditoría del payment).
 *                 Usá un user válido del tenant (no un placeholder).
 */
export async function tryAutoMatchBankTransactionToDte(
  tenantId: string,
  bankTransactionId: string,
  userId: string,
): Promise<AutoMatchResult> {
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

    const amountAbs = bankTx.amount.abs().toNumber();
    if (amountAbs === 0) {
      return { matched: false, reason: "skipped_test_amount" as const };
    }

    // Determina si es ingreso (positivo) o egreso (negativo) y busca el
    // tipo correcto de DTE: ISSUED para cobros, RECEIVED para pagos a
    // proveedor.
    const isIncome = bankTx.amount.toNumber() > 0;
    const dteDirection = isIncome ? "ISSUED" : "RECEIVED";

    // Buscar DTEs candidatos con monto exacto. Filtros:
    //   - direction según signo (cobros vs pagos)
    //   - paymentStatus IN [UNPAID, PARTIAL, OVERDUE] (pendiente)
    //   - siiStatus=ACCEPTED (no anulada)
    //   - totalAmount === amountAbs
    //   - tenantId
    //   - tx date dentro de ±90 días desde emisión
    const minDate = new Date(bankTx.transactionDate);
    minDate.setDate(minDate.getDate() - 90);
    const maxDate = new Date(bankTx.transactionDate);
    maxDate.setDate(maxDate.getDate() + 30);

    const candidates = await tx.financeDte.findMany({
      where: {
        tenantId,
        direction: dteDirection,
        siiStatus: "ACCEPTED",
        paymentStatus: { in: ["UNPAID", "PARTIAL", "OVERDUE"] },
        totalAmount: new Decimal(amountAbs),
        date: { gte: minDate, lte: maxDate },
      },
      select: {
        id: true,
        receiverRut: true,
        receiverName: true,
        issuerRut: true,
        issuerName: true,
        folio: true,
        date: true,
        totalAmount: true,
        amountPaid: true,
      },
    });

    if (candidates.length === 0) {
      return { matched: false, reason: "no_candidate" as const };
    }

    // Si hay múltiples candidatos por monto, intentamos desambiguar por
    // RUT detectado en la descripción/reference. Si solo UNO de los
    // candidatos tiene RUT en el texto, ese es el match. Si ninguno o
    // varios, marcamos ambiguous (el usuario elige a mano).
    let chosen = candidates[0];
    let matchType: "STRICT" | "AMOUNT_ONLY" = "AMOUNT_ONLY";

    // RUT a buscar en la cartola: para cobros es el receptor (cliente que
    // nos pagó); para egresos es el emisor (proveedor al que pagamos).
    const counterpartyRut = (c: { receiverRut: string | null; issuerRut: string | null }) =>
      isIncome ? c.receiverRut : c.issuerRut;

    if (candidates.length > 1) {
      const withRut = candidates.filter((c) =>
        rutAppearsInText(counterpartyRut(c), bankTx.description, bankTx.reference),
      );
      if (withRut.length === 1) {
        chosen = withRut[0];
        matchType = "STRICT";
      } else {
        return {
          matched: false,
          reason: "ambiguous" as const,
          candidateIds: candidates.map((c) => c.id),
        };
      }
    } else {
      // 1 solo candidato: si además el RUT está en el texto, confidence
      // máxima. Si no, igual matcheamos pero con AMOUNT_ONLY.
      if (
        rutAppearsInText(counterpartyRut(chosen), bankTx.description, bankTx.reference)
      ) {
        matchType = "STRICT";
      }
    }

    // Crear FinancePaymentRecord. Cobros: COB-AUTO-N (type=COLLECTION).
    // Pagos a proveedor: PAG-AUTO-N (type=DISBURSEMENT).
    const codePrefix = isIncome ? "COB-AUTO-" : "PAG-AUTO-";
    const countAuto = await tx.financePaymentRecord.count({
      where: { tenantId, code: { startsWith: codePrefix } },
    });
    const code = `${codePrefix}${String(countAuto + 1).padStart(6, "0")}`;
    const paymentRecord = await tx.financePaymentRecord.create({
      data: {
        tenantId,
        code,
        type: isIncome ? "COLLECTION" : "DISBURSEMENT",
        date: bankTx.transactionDate,
        amount: new Decimal(amountAbs),
        currency: "CLP",
        paymentMethod: "TRANSFER",
        bankAccountId: bankTx.bankAccountId,
        transferReference: bankTx.reference ?? null,
        notes:
          matchType === "STRICT"
            ? `Auto-match ${isIncome ? "cobro" : "pago"} exacto (RUT detectado en cartola): ${bankTx.description}`
            : `Auto-match ${isIncome ? "cobro" : "pago"} por monto único: ${bankTx.description}`,
        createdBy: userId,
        status: "CONFIRMED",
      },
    });

    // Allocation contra el DTE.
    await tx.financePaymentAllocation.create({
      data: {
        paymentId: paymentRecord.id,
        dteId: chosen.id,
        amount: new Decimal(amountAbs),
      },
    });

    // Update DTE: amountPaid + amountPending + paymentStatus.
    const total = chosen.totalAmount.toNumber();
    const newPaid = chosen.amountPaid.toNumber() + amountAbs;
    const newPending = Math.max(0, total - newPaid);
    await tx.financeDte.update({
      where: { id: chosen.id },
      data: {
        amountPaid: new Decimal(newPaid),
        amountPending: new Decimal(newPending),
        paymentStatus: newPaid >= total ? "PAID" : "PARTIAL",
      },
    });

    // Marcar la bank tx como MATCHED.
    await tx.financeBankTransaction.update({
      where: { id: bankTx.id },
      data: { reconciliationStatus: "MATCHED" },
    });

    // Si hay reconciliación activa del período, crear el match formal.
    await attachToActiveReconciliation(tx, {
      tenantId,
      bankAccountId: bankTx.bankAccountId,
      bankTransactionId: bankTx.id,
      paymentRecordId: paymentRecord.id,
      transactionDate: bankTx.transactionDate,
      userId,
    });

    return {
      matched: true,
      dteId: chosen.id,
      paymentRecordId: paymentRecord.id,
      matchType,
    };
  });
}

/**
 * Versión bulk: corre auto-match sobre un array de bank tx ids y
 * agrega los resultados. Devuelve el desglose para que el caller pueda
 * mostrar "X conciliaciones automáticas, Y necesitan revisión".
 *
 * Falla soft per-tx: si una falla, sigue con las demás y la incluye
 * en el array de errores.
 */
export interface BulkAutoMatchSummary {
  total: number;
  matched: number;
  ambiguous: number;
  noCandidate: number;
  skipped: number;
  /** Tx categorizadas por una regla auto-match (no DTE). */
  ruleMatched: number;
  errors: { bankTransactionId: string; message: string }[];
}

export async function bulkAutoMatchBankTransactions(
  tenantId: string,
  bankTransactionIds: string[],
  userId: string,
): Promise<BulkAutoMatchSummary> {
  const summary: BulkAutoMatchSummary = {
    total: bankTransactionIds.length,
    matched: 0,
    ambiguous: 0,
    noCandidate: 0,
    skipped: 0,
    ruleMatched: 0,
    errors: [],
  };

  for (const id of bankTransactionIds) {
    try {
      const r = await tryAutoMatchBankTransactionToDte(tenantId, id, userId);
      if (r.matched) {
        summary.matched += 1;
        continue;
      }

      // Fallback: si no hubo match contra DTE, evaluar reglas custom.
      // Si una regla matchea con requiresReview=false, creamos un link
      // EXPENSE/INCOME con la cuenta contable y marcamos MATCHED.
      if (r.reason === "no_candidate" || r.reason === "ambiguous") {
        const applied = await tryApplyRule(tenantId, id, userId);
        if (applied) {
          summary.ruleMatched += 1;
          continue;
        }
      }

      if (r.reason === "ambiguous") summary.ambiguous += 1;
      else if (r.reason === "no_candidate") summary.noCandidate += 1;
      else summary.skipped += 1;
    } catch (err) {
      summary.errors.push({
        bankTransactionId: id,
        message: err instanceof Error ? err.message : "Error desconocido",
      });
    }
  }

  return summary;
}

/**
 * Aplica la primera regla auto-match que coincida con la tx. Solo aplica
 * si la regla tiene requiresReview=false. Crea un link EXPENSE/INCOME
 * con la cuenta contable y marca MATCHED.
 *
 * Devuelve true si se aplicó una regla.
 */
async function tryApplyRule(
  tenantId: string,
  bankTransactionId: string,
  userId: string,
): Promise<boolean> {
  const tx = await prisma.financeBankTransaction.findFirst({
    where: { id: bankTransactionId, tenantId },
    select: {
      id: true,
      amount: true,
      description: true,
      reference: true,
      reconciliationStatus: true,
    },
  });
  if (!tx || tx.reconciliationStatus !== "UNMATCHED") return false;

  const evaluation = await findMatchingRule(tenantId, {
    amount: tx.amount.toNumber(),
    description: tx.description,
    reference: tx.reference,
  });
  if (!evaluation) return false;
  if (evaluation.action.requiresReview) {
    // La regla aplica pero pide revisión humana — guardamos la sugerencia
    // en la propia tx para que aparezca en el sub-tab "Reconocidos" y
    // pueda autorizarse 1-clic o en bulk. La tx sigue UNMATCHED hasta que
    // el usuario confirme.
    if (evaluation.action.accountPlanId) {
      await prisma.financeBankTransaction.update({
        where: { id: bankTransactionId },
        data: {
          suggestedRuleId: evaluation.ruleId,
          suggestedAccountPlanId: evaluation.action.accountPlanId,
        },
      });
    }
    return false;
  }
  if (!evaluation.action.accountPlanId) {
    // Regla sin cuenta contable destino → no podemos crear el link.
    return false;
  }

  const isIncome = tx.amount.toNumber() > 0;
  const amountAbs = Math.abs(tx.amount.toNumber());

  await prisma.$transaction([
    prisma.financeBankTransactionLink.create({
      data: {
        tenantId,
        bankTransactionId,
        targetType: isIncome ? "INCOME" : "EXPENSE",
        targetId: null,
        amount: new Decimal(amountAbs),
        accountPlanId: evaluation.action.accountPlanId,
        note: `Auto-match por regla: ${evaluation.ruleName}`,
        createdById: userId,
      },
    }),
    prisma.financeBankTransaction.update({
      where: { id: bankTransactionId },
      data: { reconciliationStatus: "MATCHED" },
    }),
    prisma.financeAutoMatchRule.update({
      where: { id: evaluation.ruleId },
      data: {
        timesMatched: { increment: 1 },
        lastMatchedAt: new Date(),
      },
    }),
  ]);

  return true;
}
