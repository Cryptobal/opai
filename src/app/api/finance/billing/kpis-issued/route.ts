/**
 * API Route: GET /api/finance/billing/kpis-issued
 *
 * KPIs específicos del listado de DTEs Emitidos (`/finanzas/facturacion/dtes`).
 *   - sin `?periodo` o `?periodo=ALL` → últimos 12 meses agregados.
 *   - `?periodo=YYYY-MM` → ese mes específico.
 *
 * Filtros opcionales:
 *   - `?accountId=ALL|NONE|<uuid>`
 *   - `?installationId=ALL|NONE|<uuid>`
 *
 * Devuelve:
 *   {
 *     totalEmitted: { count, amount, sparkline },  // 12 puntos mensuales
 *     accepted:     { count, pctOfTotal },
 *     pending:      { count, amount, oldestFolio, oldestDateIso },
 *     annulled:     { count, amount },
 *     ceded:        { count, amount }
 *   }
 *
 * Notas:
 *   - "Ceded" cruza con FinanceFactoringOperation; usa la relación Prisma
 *     para no hacer un IN gigante.
 *   - Si no hay datos, retorna zeros (NUNCA null).
 */

import { NextRequest, NextResponse } from "next/server";
import { requireAuth, unauthorized, resolveApiPerms } from "@/lib/api-auth";
import { hasFacturacionCapability } from "@/lib/permissions";
import { prisma } from "@/lib/prisma";
import { buildMonthRange } from "@/modules/finance/billing/sales-aggregator";

interface SparklinePoint {
  monthIso: string; // "YYYY-MM-01"
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
      direction: "ISSUED" as const,
      date: { gte: range.from, lt: range.to },
      ...accountFilter,
    };

    const [
      totalAgg,
      acceptedCount,
      pendingAgg,
      pendingOldest,
      annulledAgg,
      cededList,
    ] = await Promise.all([
      prisma.financeDte.aggregate({
        where: baseWhere,
        _sum: { totalAmount: true },
        _count: { _all: true },
      }),
      prisma.financeDte.count({
        where: { ...baseWhere, siiStatus: "ACCEPTED" },
      }),
      prisma.financeDte.aggregate({
        where: { ...baseWhere, siiStatus: { in: ["PENDING", "SENT"] } },
        _sum: { totalAmount: true },
        _count: { _all: true },
      }),
      prisma.financeDte.findFirst({
        where: { ...baseWhere, siiStatus: { in: ["PENDING", "SENT"] } },
        orderBy: { date: "asc" },
        select: { folio: true, date: true },
      }),
      prisma.financeDte.aggregate({
        where: {
          ...baseWhere,
          // "Anulado" en el sentido tributario chileno = factura cancelada,
          // sea por estado SII directo (ANNULLED) o por NC con CodRef=1
          // (voidedByCreditNoteId != null).
          OR: [
            { siiStatus: "ANNULLED" },
            { voidedByCreditNoteId: { not: null } },
          ],
          // Excluir NCs del propio cómputo: una NC anulada en sí no es
          // una factura anulada del flujo de ventas.
          dteType: { notIn: [61] },
        },
        _sum: { totalAmount: true },
        _count: { _all: true },
      }),
      prisma.financeFactoringOperation.findMany({
        where: {
          tenantId,
          status: {
            in: ["SUBMITTED", "APPROVED", "FUNDED", "COLLECTED", "CLOSED"],
          },
          dte: {
            tenantId,
            direction: "ISSUED",
            date: { gte: range.from, lt: range.to },
            ...accountFilter,
          },
        },
        select: {
          dte: { select: { totalAmount: true } },
        },
      }),
    ]);

    const totalCount = totalAgg._count._all;
    const totalAmount = totalAgg._sum.totalAmount?.toNumber() ?? 0;
    const pctOfTotal =
      totalCount > 0
        ? Math.round((acceptedCount / totalCount) * 1000) / 10
        : 0;

    // Sparkline: 12 meses anteriores (incluyendo el período activo).
    // El último punto es range.to - 1 mes; el primero es 11 meses antes.
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
        direction: "ISSUED",
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
      const key = m.toISOString().slice(0, 7); // YYYY-MM
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

    const cededCount = cededList.length;
    const cededAmount = cededList.reduce(
      (acc, c) => acc + (c.dte?.totalAmount?.toNumber?.() ?? 0),
      0,
    );

    return NextResponse.json({
      success: true,
      data: {
        totalEmitted: {
          count: totalCount,
          amount: totalAmount,
          sparkline: sparkline.map((p) => p.amount),
          sparklinePoints: sparkline,
        },
        accepted: {
          count: acceptedCount,
          pctOfTotal,
        },
        pending: {
          count: pendingAgg._count._all,
          amount: pendingAgg._sum.totalAmount?.toNumber() ?? 0,
          oldestFolio: pendingOldest?.folio ?? null,
          oldestDateIso: pendingOldest?.date
            ? new Date(pendingOldest.date).toISOString()
            : null,
        },
        annulled: {
          count: annulledAgg._count._all,
          amount: annulledAgg._sum.totalAmount?.toNumber() ?? 0,
        },
        ceded: {
          count: cededCount,
          amount: cededAmount,
        },
        periodLabel: range.label,
      },
    });
  } catch (error) {
    console.error("[Finance/Billing/KPIs-Issued] Error:", error);
    return NextResponse.json(
      { success: false, error: "Error al calcular KPIs emitidos" },
      { status: 500 },
    );
  }
}
