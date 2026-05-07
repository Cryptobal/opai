/**
 * GET /api/finance/billing/cobranzas-trend?range=ytd|3m|6m|12m
 *
 * Devuelve N puntos cronológicos según el rango pedido. Default `ytd`
 * (año en curso, 1 a 12 meses según mes actual). Usado por el
 * mini-chart del <SaludFinancieraHero>.
 */

import { NextRequest, NextResponse } from "next/server";
import { requireAuth, unauthorized, resolveApiPerms } from "@/lib/api-auth";
import { hasFacturacionCapability } from "@/lib/permissions";
import {
  computeCobranzasTrend,
  type CobranzasTrendRange,
} from "@/modules/finance/billing/cobranzas-aggregator";

const VALID_RANGES: CobranzasTrendRange[] = ["3m", "6m", "12m", "ytd"];

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
    const rangeRaw = (url.searchParams.get("range") ?? "ytd") as string;
    const rangeKey: CobranzasTrendRange = VALID_RANGES.includes(
      rangeRaw as CobranzasTrendRange,
    )
      ? (rangeRaw as CobranzasTrendRange)
      : "ytd";
    const data = await computeCobranzasTrend(ctx.tenantId, rangeKey);
    return NextResponse.json({ success: true, data });
  } catch (error) {
    console.error("[Finance/Cobranzas/Trend] Error:", error);
    return NextResponse.json(
      { success: false, error: "Error en tendencia de cobranzas" },
      { status: 500 },
    );
  }
}
