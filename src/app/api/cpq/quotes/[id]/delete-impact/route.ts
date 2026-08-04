/**
 * API Route: /api/cpq/quotes/[id]/delete-impact
 * GET - Previsualiza el impacto de eliminar la cotización (bloqueos + conteos).
 */

import { NextRequest, NextResponse } from "next/server";
import { requireAuth, unauthorized } from "@/lib/api-auth";
import { requireQuoteDelete } from "@/lib/api-auth-cpq";
import { requireTenantModule } from "@/lib/require-module";
import { buildQuoteDeleteImpact } from "@/modules/cpq/quote-delete-impact";

export async function GET(
  _request: NextRequest,
  { params }: { params: Promise<{ id: string }> },
) {
  try {
    const modCheck = await requireTenantModule("cpq");
    if (!modCheck.authorized) return modCheck.response;

    const ctx = await requireAuth();
    if (!ctx) return unauthorized();
    const forbidden = await requireQuoteDelete(ctx);
    if (forbidden) return forbidden;

    const { id } = await params;
    const impact = await buildQuoteDeleteImpact(ctx.tenantId, id);
    if (!impact) {
      return NextResponse.json(
        { success: false, error: "Cotización no encontrada" },
        { status: 404 },
      );
    }

    return NextResponse.json({ success: true, data: impact });
  } catch (error) {
    console.error("[cpq/quotes/[id]/delete-impact GET]", error);
    return NextResponse.json(
      { success: false, error: "Error al calcular el impacto" },
      { status: 500 },
    );
  }
}
