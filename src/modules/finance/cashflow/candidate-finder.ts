import "server-only";
import { prisma } from "@/lib/prisma";
import { differenceInDays, subWeeks, addWeeks } from "date-fns";
import { bulkResolveCategoriesFromAccounts } from "./categoryAccount.service";
import { getOrCreateCashflowConfig } from "./config.service";
import type { FinanceCashflowItemKind } from "@prisma/client";

export interface CashflowCandidate {
  /** id de la occurrence materializada, o null si es virtual generada por expandRecurrence */
  occurrenceId: string | null;
  itemId: string;
  itemName: string;
  installationName: string | null;
  categoryId: string;
  categoryCode: string;
  categoryName: string;
  kind: FinanceCashflowItemKind;
  /** Fecha proyectada (effectiveDate si existe, si no scheduledDate, si no virtual) */
  projectedDate: Date;
  /** Monto proyectado en CLP */
  projectedAmountClp: number;
  /** Monto del banco en CLP (siempre positivo) */
  bankAmountClp: number;
  /** Diferencia banco − proyectado */
  varianceClp: number;
  /** Días entre transactionDate y projectedDate (signed: positivo = banco posterior) */
  daysDelta: number;
  /** Score 0-100 (mayor = mejor match). Combina proximidad de monto y fecha. */
  confidence: number;
  /** Cómo se llegó al candidato: misma cuenta contable resuelta, o solo categoría/kind */
  matchReason: "ACCOUNT_MAPPED" | "CATEGORY_KIND" | "AMOUNT_ONLY";
}

export interface FindCandidatesOptions {
  /** Semanas hacia atrás desde la transactionDate (default 2). */
  weeksBack?: number;
  /** Semanas hacia adelante desde la transactionDate (default 3). */
  weeksForward?: number;
  /** Tolerancia ±% del monto (default 0.25 = ±25%). */
  amountTolerance?: number;
  /** Tope de candidatos (default 8). */
  limit?: number;
}

/**
 * Busca occurrences proyectadas (no PAID) candidatas para conciliar contra
 * un movimiento bancario. Ordenado por confidence desc.
 *
 * Reglas:
 *  - mismo kind (income↔credit, expense↔debit)
 *  - ventana ±weeksBack/Forward semanas
 *  - amountClp dentro de tolerancia
 *  - no toma occurrences ya vinculadas a otro bank tx
 *  - preferencia: misma cuenta contable resuelta vía mapping de categoría
 */
export async function findCashflowOccurrenceCandidates(
  tenantId: string,
  bankTxId: string,
  opts: FindCandidatesOptions = {},
): Promise<CashflowCandidate[]> {
  const cfg = await getOrCreateCashflowConfig(tenantId);
  const weeksBack = opts.weeksBack ?? 2;
  const weeksForward = opts.weeksForward ?? 3;
  const amountTolerance = opts.amountTolerance ?? 0.25;
  const limit = opts.limit ?? 8;

  const tx = await prisma.financeBankTransaction.findFirst({
    where: { id: bankTxId, tenantId, hiddenAt: null },
    select: {
      amount: true,
      transactionDate: true,
      links: { select: { accountPlanId: true } },
    },
  });
  if (!tx) return [];

  const txAmount = Number(tx.amount);
  if (txAmount === 0) return [];
  const txAmountAbs = Math.abs(txAmount);
  const isCredit = txAmount > 0;
  const wantKind: FinanceCashflowItemKind = isCredit ? "INCOME" : "EXPENSE";

  const minAmount = txAmountAbs * (1 - amountTolerance);
  const maxAmount = txAmountAbs * (1 + amountTolerance);
  const minDate = subWeeks(tx.transactionDate, weeksBack);
  const maxDate = addWeeks(tx.transactionDate, weeksForward);

  // Cuenta contable preferida: si la tx tiene links, usar el primero
  const preferredAccountIds = new Set(
    tx.links.map((l) => l.accountPlanId).filter((x): x is string => !!x),
  );
  const accountToCategory =
    preferredAccountIds.size > 0
      ? await bulkResolveCategoriesFromAccounts(tenantId, Array.from(preferredAccountIds))
      : new Map();
  const preferredCategoryIds = new Set(
    Array.from(accountToCategory.values()).map((c) => c.id),
  );

  const occs = await prisma.financeCashflowOccurrence.findMany({
    where: {
      tenantId,
      status: "PROJECTED",
      bankTransactionId: null,
      scheduledDate: { gte: minDate, lte: maxDate },
      amountClp: { gte: minAmount, lte: maxAmount },
      item: { isActive: true, kind: wantKind },
    },
    include: {
      item: {
        select: {
          id: true,
          name: true,
          kind: true,
          installationId: true,
          categoryId: true,
          category: { select: { id: true, code: true, name: true } },
        },
      },
    },
    take: 100,
  });

  // Resolver nombres de instalación en batch
  const installIds = Array.from(
    new Set(occs.map((o) => o.item.installationId).filter((x): x is string => !!x)),
  );
  const installs =
    installIds.length > 0
      ? await prisma.crmInstallation.findMany({
          where: { tenantId, id: { in: installIds } },
          select: { id: true, name: true },
        })
      : [];
  const installName = new Map(installs.map((i) => [i.id, i.name]));

  const candidates: CashflowCandidate[] = occs.map((o) => {
    const projDate = o.effectiveDate ?? o.scheduledDate;
    const projAmt = Number(o.amountClp);
    const variance = txAmountAbs - projAmt;
    const daysDelta = differenceInDays(tx.transactionDate, projDate);

    // Confidence score: 100 = perfecto. Penalizar diferencia de monto y días.
    const amountScore = 1 - Math.min(1, Math.abs(variance) / projAmt);
    const daysScore = 1 - Math.min(1, Math.abs(daysDelta) / 21); // 21 días = 0
    let confidence = Math.round(amountScore * 60 + daysScore * 40);

    let matchReason: CashflowCandidate["matchReason"] = "CATEGORY_KIND";
    if (preferredCategoryIds.has(o.item.categoryId)) {
      matchReason = "ACCOUNT_MAPPED";
      confidence = Math.min(100, confidence + 15);
    } else if (preferredAccountIds.size === 0) {
      matchReason = "AMOUNT_ONLY";
    }

    return {
      occurrenceId: o.id,
      itemId: o.item.id,
      itemName: o.item.name,
      installationName: o.item.installationId
        ? installName.get(o.item.installationId) ?? null
        : null,
      categoryId: o.item.category.id,
      categoryCode: o.item.category.code,
      categoryName: o.item.category.name,
      kind: o.item.kind,
      projectedDate: projDate,
      projectedAmountClp: projAmt,
      bankAmountClp: txAmountAbs,
      varianceClp: variance,
      daysDelta,
      confidence: Math.max(0, Math.min(100, confidence)),
      matchReason,
    };
  });

  void cfg; // referenciado para futuras extensiones (toleranceClp del config)
  candidates.sort((a, b) => b.confidence - a.confidence);
  return candidates.slice(0, limit);
}
