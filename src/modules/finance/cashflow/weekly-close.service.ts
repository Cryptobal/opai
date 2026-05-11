import "server-only";
import { prisma } from "@/lib/prisma";
import { getOrCreateCashflowConfig } from "./config.service";
import { weekStartForClosing, weekEndForClosing } from "./recurrence-engine";
import { buildProjection } from "./projection.service";

export interface WeeklyCloseSnapshot {
  weekStartDate: Date;
  weekEndDate: Date;
  bankBalanceClp: number;
  projectedBalanceClp: number;
  varianceClp: number;
  unassignedBank: Array<{
    id: string;
    transactionDate: Date;
    description: string;
    amount: number;
    accountPlanCode: string | null;
  }>;
  unfulfilledProj: Array<{
    occurrenceId: string;
    itemName: string;
    installationName: string | null;
    scheduledDate: Date;
    amountClp: number;
    kind: "INCOME" | "EXPENSE";
    categoryCode: string;
  }>;
}

/**
 * Calcula el snapshot del cierre semanal sin persistirlo. Útil para mostrar
 * el preview de la pantalla de cierre antes de que el usuario decida cerrar.
 */
export async function computeWeeklyCloseSnapshot(
  tenantId: string,
  weekEnd: Date,
): Promise<WeeklyCloseSnapshot> {
  const cfg = await getOrCreateCashflowConfig(tenantId);
  const dow = cfg.weekClosingDow ?? 5;
  const weekStart = weekStartForClosing(weekEnd, dow);
  const weekEndNorm = weekEndForClosing(weekEnd, dow);

  const accounts = await prisma.financeBankAccount.findMany({
    where: { tenantId, isActive: true, currency: "CLP" },
    select: { id: true, currentBalance: true },
  });
  let bankBalance = 0;
  for (const acc of accounts) {
    const snap = await prisma.financeBankAccountBalance.findFirst({
      where: { tenantId, bankAccountId: acc.id, asOfDate: { lte: weekEndNorm } },
      orderBy: [{ asOfDate: "desc" }, { createdAt: "desc" }],
      select: { balance: true },
    });
    bankBalance += snap ? Number(snap.balance) : Number(acc.currentBalance ?? 0);
  }

  const proj = await buildProjection(tenantId, {
    from: weekStart,
    to: weekEndNorm,
    granularity: "weekly",
  });
  const projectedBalance =
    proj.openingBalanceClp + proj.totals.totalIncome - proj.totals.totalExpense;
  const variance = bankBalance - projectedBalance;

  const unassignedTxs = await prisma.financeBankTransaction.findMany({
    where: {
      tenantId,
      hiddenAt: null,
      transactionDate: { gte: weekStart, lte: weekEndNorm },
      links: { none: {} },
    },
    select: {
      id: true,
      transactionDate: true,
      description: true,
      amount: true,
      links: {
        select: { accountPlan: { select: { code: true } } },
        take: 1,
      },
    },
    orderBy: { transactionDate: "desc" },
  });

  const unfulfilled = await prisma.financeCashflowOccurrence.findMany({
    where: {
      tenantId,
      status: "PROJECTED",
      bankTransactionId: null,
      scheduledDate: { gte: weekStart, lte: weekEndNorm },
    },
    include: {
      item: {
        select: {
          name: true,
          kind: true,
          installationId: true,
          category: { select: { code: true } },
        },
      },
    },
    orderBy: { scheduledDate: "asc" },
  });

  const installIds = Array.from(
    new Set(unfulfilled.map((u) => u.item.installationId).filter((x): x is string => !!x)),
  );
  const installs =
    installIds.length > 0
      ? await prisma.crmInstallation.findMany({
          where: { tenantId, id: { in: installIds } },
          select: { id: true, name: true },
        })
      : [];
  const installName = new Map(installs.map((i) => [i.id, i.name]));

  return {
    weekStartDate: weekStart,
    weekEndDate: weekEndNorm,
    bankBalanceClp: bankBalance,
    projectedBalanceClp: projectedBalance,
    varianceClp: variance,
    unassignedBank: unassignedTxs.map((t) => ({
      id: t.id,
      transactionDate: t.transactionDate,
      description: t.description,
      amount: Number(t.amount),
      accountPlanCode: t.links[0]?.accountPlan?.code ?? null,
    })),
    unfulfilledProj: unfulfilled.map((u) => ({
      occurrenceId: u.id,
      itemName: u.item.name,
      installationName: u.item.installationId ? installName.get(u.item.installationId) ?? null : null,
      scheduledDate: u.scheduledDate,
      amountClp: Number(u.amountClp),
      kind: u.item.kind,
      categoryCode: u.item.category.code,
    })),
  };
}

/**
 * Persiste el snapshot de cierre. Idempotente (upsert por tenant+weekEndDate).
 */
export async function persistWeeklyClose(
  tenantId: string,
  userId: string | null,
  weekEnd: Date,
  notes?: string,
) {
  const snap = await computeWeeklyCloseSnapshot(tenantId, weekEnd);
  const unassignedTotal = snap.unassignedBank.reduce((s, b) => s + Math.abs(b.amount), 0);
  const unfulfilledTotal = snap.unfulfilledProj.reduce((s, p) => s + p.amountClp, 0);

  const existing = await prisma.financeCashflowWeeklyClose.findFirst({
    where: { tenantId, weekEndDate: snap.weekEndDate },
  });
  if (existing) {
    return prisma.financeCashflowWeeklyClose.update({
      where: { id: existing.id },
      data: {
        bankBalanceClp: snap.bankBalanceClp,
        projectedBalanceClp: snap.projectedBalanceClp,
        varianceClp: snap.varianceClp,
        unassignedBankCount: snap.unassignedBank.length,
        unassignedBankTotalClp: unassignedTotal,
        unfulfilledProjCount: snap.unfulfilledProj.length,
        unfulfilledProjTotalClp: unfulfilledTotal,
        closedBy: userId ?? undefined,
        closedAt: new Date(),
        notes,
      },
    });
  }
  return prisma.financeCashflowWeeklyClose.create({
    data: {
      tenantId,
      weekStartDate: snap.weekStartDate,
      weekEndDate: snap.weekEndDate,
      bankBalanceClp: snap.bankBalanceClp,
      projectedBalanceClp: snap.projectedBalanceClp,
      varianceClp: snap.varianceClp,
      unassignedBankCount: snap.unassignedBank.length,
      unassignedBankTotalClp: unassignedTotal,
      unfulfilledProjCount: snap.unfulfilledProj.length,
      unfulfilledProjTotalClp: unfulfilledTotal,
      closedBy: userId ?? undefined,
      notes,
    },
  });
}

export async function nextWeekClosingDate(tenantId: string): Promise<Date> {
  const cfg = await getOrCreateCashflowConfig(tenantId);
  const dow = cfg.weekClosingDow ?? 5;
  return weekEndForClosing(new Date(), dow);
}

export async function listRecentCloses(tenantId: string, limit = 12) {
  return prisma.financeCashflowWeeklyClose.findMany({
    where: { tenantId },
    orderBy: { weekEndDate: "desc" },
    take: limit,
  });
}
