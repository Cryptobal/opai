/**
 * API Route: GET /api/finance/billing/kpis
 *
 * KPIs de la pestaña Facturación calculados según un período opcional:
 *   - sin `?periodo` → mes actual (default).
 *   - `?periodo=YYYY-MM` → ese mes específico.
 *   - `?periodo=ALL` → últimos 12 meses agregados.
 *
 * Devuelve el mismo shape que el SSR inicial:
 *   { ventasMes, ivaDebitoMes, pendientesSii, facturasMes,
 *     foliosDisponibles, foliosLowCount, comparison: { vs, pct } }
 *
 * El comparison "vs" depende del período:
 *   - mes actual o YYYY-MM → "vs mes anterior".
 *   - ALL → "vs últimos 12 meses previos".
 */

import { NextRequest, NextResponse } from "next/server";
import { requireAuth, unauthorized, resolveApiPerms } from "@/lib/api-auth";
import { hasFacturacionCapability } from "@/lib/permissions";
import { prisma } from "@/lib/prisma";
import { getFolioStatus } from "@/modules/finance/billing/folio.service";

const PERIOD_REGEX = /^\d{4}-\d{2}$/;

interface DateRange {
  from: Date;
  to: Date;
  prevFrom: Date;
  prevTo: Date;
  label: string;
}

function buildRange(periodo: string | null): DateRange {
  const now = new Date();
  if (periodo === "ALL") {
    // Últimos 12 meses (incluyendo el actual): start = primer día del mes
    // hace 11 meses; end = primer día del mes siguiente al actual.
    const start = new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth() - 11, 1));
    const end = new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth() + 1, 1));
    // Comparativo: 12 meses inmediatamente anteriores.
    const prevStart = new Date(Date.UTC(now.getUTCFullYear() - 1, now.getUTCMonth() - 11, 1));
    return {
      from: start,
      to: end,
      prevFrom: prevStart,
      prevTo: start,
      label: "vs últimos 12 meses previos",
    };
  }
  if (periodo && PERIOD_REGEX.test(periodo)) {
    const [y, m] = periodo.split("-").map((s) => parseInt(s, 10));
    const from = new Date(Date.UTC(y, m - 1, 1));
    const to = new Date(Date.UTC(y, m, 1));
    const prevFrom = new Date(Date.UTC(y, m - 2, 1));
    return { from, to, prevFrom, prevTo: from, label: "vs mes anterior" };
  }
  // Default: mes actual.
  const from = new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), 1));
  const to = new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth() + 1, 1));
  const prevFrom = new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth() - 1, 1));
  return { from, to, prevFrom, prevTo: from, label: "vs mes anterior" };
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

    const url = new URL(request.url);
    const periodoRaw = url.searchParams.get("periodo");
    const range = buildRange(periodoRaw);

    const tenantId = ctx.tenantId;
    const [actualAgg, prevAgg, pendientesSiiCount, folioStatuses] = await Promise.all([
      prisma.financeDte.aggregate({
        where: {
          tenantId,
          direction: "ISSUED",
          siiStatus: { in: ["ACCEPTED", "PENDING", "SENT"] },
          date: { gte: range.from, lt: range.to },
          dteType: { not: 61 },
        },
        _sum: { totalAmount: true, taxAmount: true },
        _count: { _all: true },
      }),
      prisma.financeDte.aggregate({
        where: {
          tenantId,
          direction: "ISSUED",
          siiStatus: "ACCEPTED",
          date: { gte: range.prevFrom, lt: range.prevTo },
          dteType: { not: 61 },
        },
        _sum: { totalAmount: true },
      }),
      // Pendientes SII no depende del período: refleja el estado actual.
      prisma.financeDte.count({
        where: {
          tenantId,
          direction: "ISSUED",
          siiStatus: { in: ["PENDING", "SENT"] },
        },
      }),
      // Folios tampoco dependen del período.
      getFolioStatus(tenantId),
    ]);

    const ventasMes = actualAgg._sum.totalAmount?.toNumber() ?? 0;
    const ivaDebitoMes = actualAgg._sum.taxAmount?.toNumber() ?? 0;
    const facturasMes = actualAgg._count._all;
    const ventasPrev = prevAgg._sum.totalAmount?.toNumber() ?? 0;
    const pctVsPrev =
      ventasPrev > 0 ? ((ventasMes - ventasPrev) / ventasPrev) * 100 : 0;
    const foliosDisponibles = folioStatuses.reduce((acc, f) => acc + f.disponibles, 0);
    const foliosLowCount = folioStatuses.filter((f) => f.lowStock).length;

    return NextResponse.json({
      success: true,
      data: {
        ventasMes,
        ivaDebitoMes,
        pendientesSii: pendientesSiiCount,
        facturasMes,
        foliosDisponibles,
        foliosLowCount,
        comparison: { vs: range.label, pct: pctVsPrev },
      },
    });
  } catch (error) {
    console.error("[Finance/Billing/KPIs] Error:", error);
    return NextResponse.json(
      { success: false, error: "Error al calcular KPIs" },
      { status: 500 },
    );
  }
}
