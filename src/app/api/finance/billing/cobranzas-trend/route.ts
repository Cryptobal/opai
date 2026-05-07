/**
 * GET /api/finance/billing/cobranzas-trend?months=6
 *
 * Devuelve N puntos cronológicos (default 6) con `mes`, `facturado`
 * y `cobrado`. Usado por el mini-chart del <SaludFinancieraHero>.
 */

import { NextRequest, NextResponse } from "next/server";
import { requireAuth, unauthorized, resolveApiPerms } from "@/lib/api-auth";
import { hasFacturacionCapability } from "@/lib/permissions";
import { computeCobranzasTrend } from "@/modules/finance/billing/cobranzas-aggregator";

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
    const monthsRaw = url.searchParams.get("months");
    const months = Math.min(
      24,
      Math.max(2, monthsRaw ? parseInt(monthsRaw, 10) || 6 : 6),
    );
    const data = await computeCobranzasTrend(ctx.tenantId, months);
    return NextResponse.json({ success: true, data });
  } catch (error) {
    console.error("[Finance/Cobranzas/Trend] Error:", error);
    return NextResponse.json(
      { success: false, error: "Error en tendencia de cobranzas" },
      { status: 500 },
    );
  }
}
