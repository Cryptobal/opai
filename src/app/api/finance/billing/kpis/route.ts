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
 *     foliosDisponibles, foliosLowCount, comparison: { vs, pct },
 *     periodLabel }
 *
 * El comparison "vs" depende del período:
 *   - mes actual o YYYY-MM → "vs mes anterior".
 *   - ALL → "vs 12 meses previos".
 *
 * Fórmula de ventas: aplicada por `computeNetSales`, espejo del F29:
 *   ventasNetas = Σ(33+34+39+41) + Σ(56) − Σ(61)
 *
 * Esto garantiza que el dashboard `/finanzas` y el módulo
 * `/finanzas/facturacion` muestren EXACTAMENTE el mismo número (antes
 * había drift porque el dashboard usaba `createdAt` y no excluía NC).
 */

import { NextRequest, NextResponse } from "next/server";
import { requireAuth, unauthorized, resolveApiPerms } from "@/lib/api-auth";
import { hasFacturacionCapability } from "@/lib/permissions";
import { prisma } from "@/lib/prisma";
import { getFolioStatus } from "@/modules/finance/billing/folio.service";
import {
  buildMonthRange,
  computeNetSales,
  prevRangeOf,
  pctChange,
} from "@/modules/finance/billing/sales-aggregator";

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
    const range = buildMonthRange(periodoRaw);
    const prev = prevRangeOf(range);

    const tenantId = ctx.tenantId;
    const [actualAgg, prevAgg, pendientesSiiCount, folioStatuses] =
      await Promise.all([
        computeNetSales(tenantId, range),
        // Mismo statusInclude que el actual: comparar like-for-like.
        computeNetSales(tenantId, prev),
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

    const foliosDisponibles = folioStatuses.reduce(
      (acc, f) => acc + f.disponibles,
      0,
    );
    const foliosLowCount = folioStatuses.filter((f) => f.lowStock).length;

    return NextResponse.json({
      success: true,
      data: {
        ventasMes: actualAgg.ventasNetas,
        ivaDebitoMes: actualAgg.ivaDebito,
        pendientesSii: pendientesSiiCount,
        facturasMes: actualAgg.facturasMes,
        foliosDisponibles,
        foliosLowCount,
        comparison: {
          vs: prev.label,
          pct: pctChange(actualAgg.ventasNetas, prevAgg.ventasNetas),
        },
        periodLabel: range.label,
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
