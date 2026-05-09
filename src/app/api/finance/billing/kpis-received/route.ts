/**
 * API Route: GET /api/finance/billing/kpis-received
 *
 * KPIs específicos del listado de DTEs Recibidos
 * (`/finanzas/facturacion/recibidos`). Mismo patrón que kpis-issued pero
 * con métricas que importan en compras: total recibido, aceptados al SII,
 * pendientes de revisión, reclamados, monto por pagar.
 *
 *   - sin `?periodo` o `?periodo=ALL` → últimos 12 meses agregados.
 *   - `?periodo=YYYY-MM` → ese mes específico.
 *
 * Filtros opcionales:
 *   - `?accountId=ALL|NONE|<uuid>`
 *   - `?installationId=ALL|NONE|<uuid>`
 *
 * Devuelve:
 *   {
 *     totalReceived: { count, amount, sparkline, sparklinePoints },
 *     accepted:      { count, pctOfTotal },
 *     pendingReview: { count, amount, oldestDateIso },
 *     claimed:       { count, amount },
 *     toPay:         { count, amount }
 *   }
 */

import { NextRequest, NextResponse } from "next/server";
import { requireAuth, unauthorized, resolveApiPerms } from "@/lib/api-auth";
import { hasFacturacionCapability } from "@/lib/permissions";
import { prisma } from "@/lib/prisma";
import { buildMonthRange } from "@/modules/finance/billing/sales-aggregator";

interface SparklinePoint {
  monthIso: string;
  amount: number;
}

export async function GET(request: NextRequest) {
  try {
    const ctx = await requireAuth();
    if (!ctx) return unauthorized();
    const perms = await resolveApiPerms(ctx);
    if (!hasFacturacionCapability(perms, "facturacion_view")) {
      return NextResponse.json(
        { success: false, error: "Sin permisos" },
        { status: 403 },
      );
    }

    const tenantId = ctx.tenantId;
    const url = new URL(request.url);
    const periodoRaw = url.searchParams.get("periodo");
    const accountIdRaw = url.searchParams.get("accountId");
    const installationIdRaw = url.searchParams.get("installationId");

    const range = buildMonthRange(periodoRaw);

    const accountFilter: Record<string, unknown> = {};
    if (accountIdRaw === "NONE") {
      accountFilter.crmAccountId = null;
    } else if (accountIdRaw && accountIdRaw !== "ALL") {
      accountFilter.crmAccountId = accountIdRaw;
    }
    if (installationIdRaw === "NONE") {
      accountFilter.installationId = null;
    } else if (installationIdRaw && installationIdRaw !== "ALL") {
      accountFilter.installationId = installationIdRaw;
    }

    const baseWhere = {
      tenantId,
      direction: "RECEIVED" as const,
      date: { gte: range.from, lt: range.to },
      ...accountFilter,
    };

    const [
      totalAgg,
      acceptedCount,
      pendingAgg,
      pendingOldest,
      claimedAgg,
      toPayAgg,
    ] = await Promise.all([
      prisma.financeDte.aggregate({
        where: baseWhere,
        _sum: { totalAmount: true },
        _count: { _all: true },
      }),
      prisma.financeDte.count({
        where: { ...baseWhere, receptionStatus: "ACCEPTED" },
      }),
      prisma.financeDte.aggregate({
        where: { ...baseWhere, receptionStatus: "PENDING_REVIEW" },
        _sum: { totalAmount: true },
        _count: { _all: true },
      }),
      prisma.financeDte.findFirst({
        where: { ...baseWhere, receptionStatus: "PENDING_REVIEW" },
        orderBy: { date: "asc" },
        select: { date: true, folio: true },
      }),
      prisma.financeDte.aggregate({
        where: {
          ...baseWhere,
          receptionStatus: { in: ["CLAIMED", "PARTIAL_CLAIM"] },
        },
        _sum: { totalAmount: true },
        _count: { _all: true },
      }),
      prisma.financeDte.aggregate({
        where: { ...baseWhere, paymentStatus: { in: ["UNPAID", "PARTIAL", "OVERDUE"] } },
        _sum: { amountPending: true },
        _count: { _all: true },
      }),
    ]);

    const totalCount = totalAgg._count._all;
    const totalAmount = totalAgg._sum.totalAmount?.toNumber() ?? 0;
    const pctOfTotal =
      totalCount > 0
        ? Math.round((acceptedCount / totalCount) * 1000) / 10
        : 0;

    const lastMonth = new Date(
      Date.UTC(range.to.getUTCFullYear(), range.to.getUTCMonth() - 1, 1),
    );
    const firstMonth = new Date(
      Date.UTC(lastMonth.getUTCFullYear(), lastMonth.getUTCMonth() - 11, 1),
    );
    const sparkRangeFrom = firstMonth;
    const sparkRangeTo = new Date(
      Date.UTC(lastMonth.getUTCFullYear(), lastMonth.getUTCMonth() + 1, 1),
    );

    const sparkRows = await prisma.financeDte.findMany({
      where: {
        tenantId,
        direction: "RECEIVED",
        date: { gte: sparkRangeFrom, lt: sparkRangeTo },
        ...accountFilter,
      },
      select: { date: true, totalAmount: true },
    });

    const monthBuckets = new Map<string, number>();
    for (let i = 0; i < 12; i++) {
      const m = new Date(
        Date.UTC(firstMonth.getUTCFullYear(), firstMonth.getUTCMonth() + i, 1),
      );
      const key = m.toISOString().slice(0, 7);
      monthBuckets.set(key, 0);
    }
    for (const row of sparkRows) {
      if (!row.date) continue;
      const d = new Date(row.date);
      const key = `${d.getUTCFullYear()}-${String(d.getUTCMonth() + 1).padStart(2, "0")}`;
      const prev = monthBuckets.get(key) ?? 0;
      monthBuckets.set(key, prev + (row.totalAmount?.toNumber?.() ?? 0));
    }
    const sparkline: SparklinePoint[] = Array.from(monthBuckets.entries())
      .sort(([a], [b]) => (a < b ? -1 : a > b ? 1 : 0))
      .map(([key, amount]) => ({ monthIso: `${key}-01`, amount }));

    return NextResponse.json({
      success: true,
      data: {
        totalReceived: {
          count: totalCount,
          amount: totalAmount,
          sparkline: sparkline.map((p) => p.amount),
          sparklinePoints: sparkline,
        },
        accepted: {
          count: acceptedCount,
          pctOfTotal,
        },
        pendingReview: {
          count: pendingAgg._count._all,
          amount: pendingAgg._sum.totalAmount?.toNumber() ?? 0,
          oldestDateIso: pendingOldest?.date
            ? new Date(pendingOldest.date).toISOString()
            : null,
          oldestFolio: pendingOldest?.folio ?? null,
        },
        claimed: {
          count: claimedAgg._count._all,
          amount: claimedAgg._sum.totalAmount?.toNumber() ?? 0,
        },
        toPay: {
          count: toPayAgg._count._all,
          amount: toPayAgg._sum.amountPending?.toNumber() ?? 0,
        },
        periodLabel: range.label,
      },
    });
  } catch (error) {
    console.error("[Finance/Billing/KPIs-Received] Error:", error);
    return NextResponse.json(
      { success: false, error: "Error al calcular KPIs recibidos" },
      { status: 500 },
    );
  }
}
