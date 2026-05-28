import "server-only";
import type { Prisma } from "@prisma/client";
import { prisma } from "@/lib/prisma";
import { getOrCreateCashflowConfig } from "./config.service";
import { weekStartForClosing, weekEndForClosing } from "./recurrence-engine";
import { buildProjection } from "./projection.service";
import { findCashflowOccurrenceCandidates } from "./candidate-finder";

/** Una bank tx de la semana, con su estado de conciliación/exclusión y
 *  (cuando es pendiente) la mejor sugerencia de calce. Alimenta las 3
 *  secciones del modal de cuadratura. */
export interface BankTxSnapshot {
  id: string;
  transactionDate: Date;
  description: string;
  amount: number;
  accountPlanCode: string | null;
  excludedReason: string | null;
  reconciliationStatus: string;
  matchedOccurrenceId: string | null;
  matchedItemName: string | null;
  suggest: { occurrenceId: string; itemName: string; confidence: number } | null;
}

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
  /** TODAS las bank tx de la semana (conciliadas + pendientes + excluidas),
   *  con su sugerencia de calce cuando son pendientes. Alimenta el modal de
   *  cuadratura (secciones Pendientes / Conciliados / Excluidos). */
  allBank: BankTxSnapshot[];
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

  // Cartola completa de la semana (para el modal de cuadratura): conciliadas,
  // pendientes y excluidas, con item conciliado cuando existe.
  const allBankRaw = await prisma.financeBankTransaction.findMany({
    where: {
      tenantId,
      hiddenAt: null,
      transactionDate: { gte: weekStart, lte: weekEndNorm },
    },
    select: {
      id: true,
      transactionDate: true,
      description: true,
      amount: true,
      excludedReason: true,
      reconciliationStatus: true,
      bankAccount: { select: { bankCode: true } },
      cashflowOccurrences: {
        take: 1,
        select: { id: true, item: { select: { name: true } } },
      },
    },
    orderBy: { transactionDate: "desc" },
  });

  // Sugerencias de calce para las pendientes (sin match y no excluidas). Tope
  // de 30 para acotar el costo del candidate-finder por request.
  const pendingIds = allBankRaw
    .filter((t) => t.excludedReason == null && t.cashflowOccurrences.length === 0)
    .slice(0, 30)
    .map((t) => t.id);
  const suggestionEntries = await Promise.all(
    pendingIds.map(async (id) => {
      const candidates = await findCashflowOccurrenceCandidates(tenantId, id, { limit: 1 });
      const top = candidates[0];
      if (!top || top.occurrenceId == null) return [id, null] as const;
      return [
        id,
        { occurrenceId: top.occurrenceId, itemName: top.itemName, confidence: top.confidence },
      ] as const;
    }),
  );
  const suggestByTx = new Map(suggestionEntries);

  const allBank: BankTxSnapshot[] = allBankRaw.map((t) => ({
    id: t.id,
    transactionDate: t.transactionDate,
    description: t.description,
    amount: Number(t.amount),
    accountPlanCode: t.bankAccount?.bankCode ?? null,
    excludedReason: t.excludedReason,
    reconciliationStatus: t.reconciliationStatus,
    matchedOccurrenceId: t.cashflowOccurrences[0]?.id ?? null,
    matchedItemName: t.cashflowOccurrences[0]?.item?.name ?? null,
    suggest: suggestByTx.get(t.id) ?? null,
  }));

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
    allBank,
  };
}

export interface PersistWeeklyCloseInput {
  weekEnd: Date;
  notes?: string;
  /** Si true, marca este cierre como anchor de la proyección y desactiva
   *  cualquier anchor previo del tenant en la misma transacción. */
  anchor?: boolean;
  /** Cómo se resolvió la diferencia banco vs proyectado de la semana.
   *  Default 'PENDING' (drift no resuelto formalmente). */
  varianceResolution?: "ADJUSTED" | "ACCEPTED" | "PENDING";
  /** "real" (default) ancla el saldo banco calculado; "manual" ancla un saldo
   *  tipeado por el usuario con motivo obligatorio y genera la occurrence de
   *  ajuste para que la fórmula cuadre. */
  mode?: "real" | "manual";
  /** Requerido si mode=manual: saldo final forzado en CLP. */
  forcedBalanceClp?: number;
  /** Requerido si mode=manual (min 5 chars): por qué se forzó el saldo. */
  manualReason?: string;
}

/** Resuelve la categoría para el ajuste de cierre manual: prefiere la categoría
 *  sistema de ajuste de conciliación del kind, cae a OTRO, y a la primera
 *  activa. Multi-tenant. */
async function resolveAdjustCategoryId(
  tx: Prisma.TransactionClient,
  tenantId: string,
  kind: "INCOME" | "EXPENSE",
): Promise<string> {
  const codes =
    kind === "INCOME"
      ? ["ING_AJUSTE_CONCILIACION", "ING_OTRO"]
      : ["EGR_AJUSTE_CONCILIACION", "EGR_OTRO"];
  for (const code of codes) {
    const cat = await tx.financeCashflowCategory.findFirst({
      where: { tenantId, code, kind, isActive: true },
      select: { id: true },
    });
    if (cat) return cat.id;
  }
  const any = await tx.financeCashflowCategory.findFirst({
    where: { tenantId, kind, isActive: true },
    orderBy: { sortOrder: "asc" },
    select: { id: true },
  });
  if (!any) throw new Error(`No hay categoría ${kind} disponible para el ajuste`);
  return any.id;
}

/**
 * Persiste el snapshot de cierre. Idempotente (upsert por tenant+weekEndDate).
 *
 * Si `anchor=true`, desactiva el anchor previo del tenant antes de prender
 * el nuevo, todo en una sola transacción para que nunca haya dos anchors
 * activos simultáneamente (también protegido por el índice único parcial
 * uq_cashflow_weekly_close_anchor_per_tenant).
 */
export async function persistWeeklyClose(
  tenantId: string,
  userId: string | null,
  input: PersistWeeklyCloseInput,
) {
  const snap = await computeWeeklyCloseSnapshot(tenantId, input.weekEnd);
  const unassignedTotal = snap.unassignedBank.reduce((s, b) => s + Math.abs(b.amount), 0);
  const unfulfilledTotal = snap.unfulfilledProj.reduce((s, p) => s + p.amountClp, 0);
  const anchor = input.anchor ?? false;
  const varianceResolution = input.varianceResolution ?? "PENDING";
  const mode = input.mode ?? "real";

  if (mode === "manual") {
    if (input.forcedBalanceClp == null || !Number.isFinite(input.forcedBalanceClp)) {
      throw new Error("forcedBalanceClp requerido para cierre manual");
    }
    if (!input.manualReason || input.manualReason.trim().length < 5) {
      throw new Error("manualReason requerido (mínimo 5 caracteres) para cierre manual");
    }
  }

  const finalBalance =
    mode === "manual" ? (input.forcedBalanceClp as number) : Number(snap.bankBalanceClp);

  return prisma.$transaction(async (tx) => {
    if (anchor) {
      await tx.financeCashflowWeeklyClose.updateMany({
        where: { tenantId, isAnchor: true },
        data: { isAnchor: false },
      });
    }

    // Cierre manual con diferencia → occurrence de ajuste reconciliada para que
    // apertura + entra − sale = cierre siga cuadrando.
    let adjustOccurrenceId: string | null = null;
    if (mode === "manual") {
      const projectedAt = Number(snap.projectedBalanceClp);
      const diff = finalBalance - projectedAt;
      if (Math.abs(diff) > 1) {
        const kind: "INCOME" | "EXPENSE" = diff > 0 ? "INCOME" : "EXPENSE";
        const categoryId = await resolveAdjustCategoryId(tx, tenantId, kind);
        let adjustItem = await tx.financeCashflowItem.findFirst({
          where: {
            tenantId,
            name: "Ajustes de cierre manual",
            source: "MANUAL",
            kind,
          },
          select: { id: true },
        });
        if (!adjustItem) {
          adjustItem = await tx.financeCashflowItem.create({
            data: {
              tenantId,
              categoryId,
              name: "Ajustes de cierre manual",
              kind,
              amount: 0,
              currency: "CLP",
              source: "MANUAL",
              isActive: true,
              recurrence: "ONCE",
              startDate: snap.weekEndDate,
              createdBy: userId ?? undefined,
            },
            select: { id: true },
          });
        }
        const adjustOcc = await tx.financeCashflowOccurrence.create({
          data: {
            tenantId,
            itemId: adjustItem.id,
            scheduledDate: snap.weekEndDate,
            effectiveDate: snap.weekEndDate,
            amountClp: Math.abs(diff),
            status: "PAID",
            isClosingAdjust: true,
            notes: `Ajuste automático del cierre manual: motivo="${input.manualReason}"`,
          },
          select: { id: true },
        });
        adjustOccurrenceId = adjustOcc.id;
      }
    }

    const existing = await tx.financeCashflowWeeklyClose.findFirst({
      where: { tenantId, weekEndDate: snap.weekEndDate },
    });
    const data = {
      bankBalanceClp: snap.bankBalanceClp,
      projectedBalanceClp: snap.projectedBalanceClp,
      varianceClp: snap.varianceClp,
      unassignedBankCount: snap.unassignedBank.length,
      unassignedBankTotalClp: unassignedTotal,
      unfulfilledProjCount: snap.unfulfilledProj.length,
      unfulfilledProjTotalClp: unfulfilledTotal,
      closedBy: userId ?? undefined,
      closedAt: new Date(),
      notes: input.notes,
      isAnchor: anchor,
      varianceResolution,
      isManual: mode === "manual",
      forcedBalanceClp: mode === "manual" ? input.forcedBalanceClp : null,
      manualReason: mode === "manual" ? input.manualReason : null,
      adjustOccurrenceId,
    };

    if (existing) {
      // Si el cierre previo creó un ajuste distinto, lo borramos (evita
      // ajustes huérfanos al re-cerrar con otro saldo/modo).
      if (existing.adjustOccurrenceId && existing.adjustOccurrenceId !== adjustOccurrenceId) {
        await tx.financeCashflowOccurrence
          .delete({ where: { id: existing.adjustOccurrenceId } })
          .catch(() => {});
      }
      return tx.financeCashflowWeeklyClose.update({
        where: { id: existing.id },
        data,
      });
    }
    return tx.financeCashflowWeeklyClose.create({
      data: {
        tenantId,
        weekStartDate: snap.weekStartDate,
        weekEndDate: snap.weekEndDate,
        ...data,
      },
    });
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
