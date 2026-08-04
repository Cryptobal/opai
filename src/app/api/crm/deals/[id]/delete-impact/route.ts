/**
 * API Route: /api/crm/deals/[id]/delete-impact
 * GET - Previsualiza el impacto de eliminar el negocio (cotizaciones + propuestas en cascada).
 */

import { NextRequest, NextResponse } from "next/server";
import { requireAuth, unauthorized } from "@/lib/api-auth";
import { requireCrmDelete } from "@/lib/api-auth-crm";
import { requireTenantModule } from "@/lib/require-module";
import { buildDealDeleteImpact } from "@/modules/cpq/quote-delete-impact";

export async function GET(
  _request: NextRequest,
  { params }: { params: Promise<{ id: string }> },
) {
  try {
    const modCheck = await requireTenantModule("crm");
    if (!modCheck.authorized) return modCheck.response;

    const ctx = await requireAuth();
    if (!ctx) return unauthorized();
    const forbidden = await requireCrmDelete(ctx, "deals");
    if (forbidden) return forbidden;

    const { id } = await params;
    const impact = await buildDealDeleteImpact(ctx.tenantId, id);
    if (!impact) {
      return NextResponse.json(
        { success: false, error: "Negocio no encontrado" },
        { status: 404 },
      );
    }

    return NextResponse.json({ success: true, data: impact });
  } catch (error) {
    console.error("[crm/deals/[id]/delete-impact GET]", error);
    return NextResponse.json(
      { success: false, error: "Error al calcular el impacto" },
      { status: 500 },
    );
  }
}
