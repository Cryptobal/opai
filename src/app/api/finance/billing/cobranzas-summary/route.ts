/**
 * GET /api/finance/billing/cobranzas-summary?periodo=YYYY-MM
 *
 * Devuelve el shape consumido por <SaludFinancieraHero>: facturado,
 * cobrado, por cobrar, aging, vencidas, margen, IVA neto. Mismo
 * statusInclude (ACCEPTED+PENDING+SENT) que el resto del módulo para
 * que los números coincidan con el KPIRow.
 *
 * - sin `?periodo` → mes actual (default).
 * - `?periodo=YYYY-MM` → ese mes.
 * - `?periodo=ALL` → últimos 12 meses (igual que kpis).
 */

import { NextRequest, NextResponse } from "next/server";
import { requireAuth, unauthorized, resolveApiPerms } from "@/lib/api-auth";
import { hasFacturacionCapability } from "@/lib/permissions";
import { buildMonthRange } from "@/modules/finance/billing/sales-aggregator";
import { computeCobranzasSummary } from "@/modules/finance/billing/cobranzas-aggregator";

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
    const periodo = url.searchParams.get("periodo");
    const range = buildMonthRange(periodo);

    const summary = await computeCobranzasSummary(ctx.tenantId, range);

    return NextResponse.json({
      success: true,
      data: { ...summary, periodLabel: range.label },
    });
  } catch (error) {
    console.error("[Finance/Cobranzas/Summary] Error:", error);
    return NextResponse.json(
      { success: false, error: "Error al calcular cobranzas" },
      { status: 500 },
    );
  }
}
