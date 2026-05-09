import "server-only";
import { prisma } from "@/lib/prisma";
import { differenceInDays } from "date-fns";
import { upsertOccurrence } from "./occurrence.service";
import { getOrCreateCashflowConfig } from "./config.service";
import type { VirtualOccurrence } from "./types";

export async function autoMatchOccurrencesToBankTx(
  tenantId: string,
  occurrences: VirtualOccurrence[],
  windowFrom: Date,
  windowTo: Date,
  performedBy: string | null,
): Promise<{ matched: number; reviewed: number }> {
  const config = await getOrCreateCashflowConfig(tenantId);

  const txs = await prisma.financeBankTransaction.findMany({
    where: {
      tenantId,
      transactionDate: { gte: windowFrom, lte: windowTo },
      hiddenAt: null,
    },
    select: {
      id: true,
      transactionDate: true,
      amount: true,
      description: true,
    },
  });

  const alreadyMatched = await prisma.financeCashflowOccurrence.findMany({
    where: { tenantId, bankTransactionId: { not: null } },
    select: { bankTransactionId: true },
  });
  const usedTxIds = new Set<string>(
    alreadyMatched.map((m) => m.bankTransactionId).filter((x): x is string => !!x),
  );

  const unmatched = occurrences.filter(
    (o) => !o.bankTransactionId && o.status === "PROJECTED" && o.itemId !== null,
  );

  let matched = 0;

  for (const occ of unmatched) {
    let best: { txId: string; score: number } | null = null;
    for (const tx of txs) {
      if (usedTxIds.has(tx.id)) continue;
      const txAmtRaw = Number(tx.amount);
      const isCredit = txAmtRaw > 0;
      const want = occ.kind === "INCOME" ? isCredit : !isCredit;
      if (!want) continue;

      const txAmt = Math.abs(txAmtRaw);
      const occAmt = Math.abs(occ.amountClp);
      const amtDiff = Math.abs(txAmt - occAmt);
      if (amtDiff > config.matchAmountToleranceClp) continue;

      const daysDiff = Math.abs(differenceInDays(tx.transactionDate, occ.scheduledDate));
      if (daysDiff > config.matchDaysTolerance) continue;

      const score = amtDiff + daysDiff * 1000;
      if (!best || score < best.score) best = { txId: tx.id, score };
    }

    if (best && occ.itemId) {
      await upsertOccurrence(tenantId, occ.itemId, occ.scheduledDate, {
        amountClp: occ.amountClp,
        amountOverride: occ.amountOriginal,
        ufValueUsed: occ.ufValueUsed,
        status: "PAID",
        bankTransactionId: best.txId,
        matchedBy: performedBy,
      });
      usedTxIds.add(best.txId);
      matched++;
    }
  }

  return { matched, reviewed: unmatched.length };
}
