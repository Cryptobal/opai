import { NextResponse } from "next/server";
import { requireAuth, unauthorized, resolveApiPerms } from "@/lib/api-auth";
import { hasCapability } from "@/lib/permissions";
import { prisma } from "@/lib/prisma";
import { resolveOpeningBalance } from "@/modules/finance/cashflow/opening-balance.service";
import { buildProjection } from "@/modules/finance/cashflow/projection.service";
import { addWeeks, addDays } from "date-fns";

/**
 * GET /api/finance/cashflow/balance-health
 *
 * Diagnóstico de cuadratura entre saldo bancario y saldo proyectado.
 * Endpoint read-only. No side effects.
 *
 * Respuesta:
 *  - opening: saldo bancario "as of today" + desglose por cuenta
 *  - projection: saldo proyectado al final del bucket actual + drift
 *  - unassignedBank: bank tx no vinculadas en los últimos 30 días
 *  - unfulfilledProj: ocurrencias proyectadas atrasadas o de hoy + 7 días
 *  - alerts: array de strings con flags accionables
 */
export async function GET() {
  const ctx = await requireAuth();
  if (!ctx) return unauthorized();
  const perms = await resolveApiPerms(ctx);
  if (!hasCapability(perms, "cashflow_view")) {
    return NextResponse.json(
      { success: false, error: "Sin permisos" },
      { status: 403 },
    );
  }
  const tenantId = ctx.tenantId;

  const today = new Date();
  const opening = await resolveOpeningBalance(tenantId, today);

  const projection = await buildProjection(tenantId, {
    from: today,
    to: addWeeks(today, 4),
    granularity: "weekly",
  });

  const drift = projection.totals.currentDriftClp;
  const currentBucket =
    projection.cumulativePoints.find((p) => p.realBankClp !== null) ?? null;

  const thirtyDaysAgo = addDays(today, -30);
  const unassignedBankTxs = await prisma.financeBankTransaction.findMany({
    where: {
      tenantId,
      hiddenAt: null,
      transactionDate: { gte: thirtyDaysAgo, lte: today },
      links: { none: {} },
      reconciliationStatus: { notIn: ["MATCHED", "RECONCILED"] },
    },
    select: {
      id: true,
      transactionDate: true,
      description: true,
      reference: true,
      amount: true,
      reconciliationStatus: true,
      suggestedAccountPlanId: true,
    },
    orderBy: { transactionDate: "desc" },
    take: 100,
  });

  const sevenDaysAhead = addDays(today, 7);
  const unfulfilled = await prisma.financeCashflowOccurrence.findMany({
    where: {
      tenantId,
      status: "PROJECTED",
      bankTransactionId: null,
      scheduledDate: { lte: sevenDaysAhead },
    },
    include: {
      item: {
        select: {
          name: true,
          kind: true,
          installationId: true,
          category: { select: { code: true, name: true } },
        },
      },
    },
    orderBy: { scheduledDate: "asc" },
    take: 100,
  });

  const installIds = Array.from(
    new Set(
      unfulfilled
        .map((u) => u.item.installationId)
        .filter((x): x is string => !!x),
    ),
  );
  const installs =
    installIds.length > 0
      ? await prisma.crmInstallation.findMany({
          where: { tenantId, id: { in: installIds } },
          select: { id: true, name: true },
        })
      : [];
  const installName = new Map(installs.map((i) => [i.id, i.name]));

  const alerts: string[] = [];
  for (const acc of opening.perAccount) {
    if (!acc.anchorSnapshotDate) {
      alerts.push(
        `Cuenta ${acc.bankName} (${acc.accountNumber}): sin snapshots de saldo. Importa una cartola o fija el saldo manual.`,
      );
      continue;
    }
    const daysSinceSnap =
      (today.getTime() - acc.anchorSnapshotDate.getTime()) / (1000 * 60 * 60 * 24);
    if (daysSinceSnap > 7) {
      alerts.push(
        `Cuenta ${acc.bankName} (${acc.accountNumber}): última cartola hace ${Math.round(daysSinceSnap)} días. Actualiza el saldo.`,
      );
    }
  }
  if (drift !== null && Math.abs(drift) >= 500_000) {
    alerts.push(
      `Drift de caja significativo: ${drift > 0 ? "+" : ""}${drift.toLocaleString("es-CL")} CLP. Revisa los movimientos huérfanos y las cuotas no cumplidas.`,
    );
  }
  if (unassignedBankTxs.length >= 20) {
    alerts.push(
      `Hay ${unassignedBankTxs.length} movimientos del banco sin asignar en los últimos 30 días. Procesa la bandeja para reducir el drift.`,
    );
  }

  return NextResponse.json({
    success: true,
    data: {
      asOfDate: today.toISOString(),
      opening: {
        totalClp: opening.totalClp,
        perAccount: opening.perAccount.map((a) => ({
          ...a,
          anchorSnapshotDate: a.anchorSnapshotDate?.toISOString() ?? null,
        })),
      },
      projection: {
        currentDriftClp: drift,
        projectedAtCurrentBucketClp: currentBucket?.projectedClp ?? null,
        realBankAtCurrentBucketClp: currentBucket?.realBankClp ?? null,
      },
      unassignedBank: {
        count: unassignedBankTxs.length,
        totalClp: unassignedBankTxs.reduce(
          (s, t) => s + Math.abs(Number(t.amount)),
          0,
        ),
        items: unassignedBankTxs.map((t) => ({
          id: t.id,
          transactionDate: t.transactionDate.toISOString(),
          description: t.description,
          reference: t.reference,
          amountClp: Number(t.amount),
          reconciliationStatus: t.reconciliationStatus,
          hasSuggestion: !!t.suggestedAccountPlanId,
        })),
      },
      unfulfilledProj: {
        count: unfulfilled.length,
        totalClp: unfulfilled.reduce((s, u) => s + Number(u.amountClp), 0),
        items: unfulfilled.map((u) => ({
          occurrenceId: u.id,
          itemName: u.item.name,
          installationName: u.item.installationId
            ? installName.get(u.item.installationId) ?? null
            : null,
          scheduledDate: u.scheduledDate.toISOString(),
          amountClp: Number(u.amountClp),
          kind: u.item.kind,
          categoryCode: u.item.category.code,
          categoryName: u.item.category.name,
          isOverdue: u.scheduledDate.getTime() < today.getTime(),
        })),
      },
      alerts,
    },
  });
}
