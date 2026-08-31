import "server-only";
import { prisma } from "@/lib/prisma";
import { Decimal } from "@prisma/client/runtime/library";
import { resolveAccountPlanIdForFlowRow } from "./flow-row-account-plan.service";
import { resolveRowIdForOccurrence } from "@/modules/finance/flow-v3/occurrence-real-fallback";

export type HealOccurrenceLinkResult =
  | { created: true; flowRowId: string | null }
  | { created: false; reason: "already_has_links" | "no_occurrence" | "no_account" };

/**
 * MATCHED + occurrence de flujo (asignación v2 / confirm-match) sin
 * FinanceBankTransactionLink. Crea el EXPENSE/INCOME con flowRowId para
 * que planilla v3 y el drawer de conciliación converjan.
 */
export async function healBankTxLinkFromCashflowOccurrence(
  tenantId: string,
  bankTxId: string,
  userId: string | null,
): Promise<HealOccurrenceLinkResult> {
  const existing = await prisma.financeBankTransactionLink.count({
    where: { tenantId, bankTransactionId: bankTxId },
  });
  if (existing > 0) return { created: false, reason: "already_has_links" };

  const occ = await prisma.financeCashflowOccurrence.findFirst({
    where: { tenantId, bankTransactionId: bankTxId },
    select: {
      amountClp: true,
      item: { select: { name: true, kind: true, categoryId: true } },
    },
  });
  if (!occ?.item) return { created: false, reason: "no_occurrence" };

  const tx = await prisma.financeBankTransaction.findFirst({
    where: { id: bankTxId, tenantId },
    select: { amount: true },
  });
  if (!tx) return { created: false, reason: "no_occurrence" };

  const created = await createExpenseIncomeLinkForCategory({
    tenantId,
    bankTxId,
    userId,
    amountAbs: Math.abs(Number(occ.amountClp) || Number(tx.amount)),
    isIncome: Number(tx.amount) > 0,
    categoryId: occ.item.categoryId,
    itemName: occ.item.name,
  });
  if (!created) return { created: false, reason: "no_account" };
  return { created: true, flowRowId: created.flowRowId };
}

export async function createExpenseIncomeLinkForCategory(args: {
  tenantId: string;
  bankTxId: string;
  userId: string | null;
  amountAbs: number;
  isIncome: boolean;
  categoryId: string | null;
  itemName?: string | null;
}): Promise<{ flowRowId: string | null } | null> {
  const { tenantId, bankTxId, userId, amountAbs, isIncome, categoryId, itemName } =
    args;

  const existing = await prisma.financeBankTransactionLink.count({
    where: { tenantId, bankTransactionId: bankTxId },
  });
  if (existing > 0) return { flowRowId: null };

  const rows = await prisma.financeFlowRow.findMany({
    where: { tenantId, archivedAt: null },
    select: { id: true, name: true, categoryId: true },
    orderBy: { orderIndex: "asc" },
  });
  const flowRowId = resolveRowIdForOccurrence(
    {
      bankTransactionId: bankTxId,
      categoryId,
      itemName: itemName ?? "",
    },
    rows,
  );
  const flowRow = flowRowId ? rows.find((r) => r.id === flowRowId) : undefined;

  const accountPlanId = await resolveAccountPlanIdForFlowRow(tenantId, {
    id: flowRow?.id,
    categoryId: flowRow?.categoryId ?? categoryId,
  });
  if (!accountPlanId) return null;

  const abs = Math.abs(amountAbs);
  if (!Number.isFinite(abs) || abs <= 0) return null;

  await prisma.financeBankTransactionLink.create({
    data: {
      tenantId,
      bankTransactionId: bankTxId,
      targetType: isIncome ? "INCOME" : "EXPENSE",
      targetId: null,
      amount: new Decimal(abs),
      accountPlanId,
      flowRowId: flowRowId ?? null,
      note: flowRow
        ? `Clasificado a fila flujo: ${flowRow.name}`
        : itemName
          ? `Asignado a flujo: ${itemName}`
          : "Asignado a flujo de caja",
      matchSource: "MANUAL",
      createdById: userId,
    },
  });
  return { flowRowId: flowRowId ?? null };
}
