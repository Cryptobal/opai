/**
 * API Route: /api/cpq/quotes/[id]/convert-to-bundle
 * POST - Convierte la cotización en propuesta multi-instalación (in-place):
 *        crea el bundle con la quote como primera hija heredando datos CRM,
 *        condiciones comerciales y gasto financiero. 422 si no tiene negocio.
 */

import { NextRequest, NextResponse } from "next/server";
import { requireAuth, unauthorized } from "@/lib/api-auth";
import { requireCpqEdit } from "@/lib/api-auth-cpq";
import { requireTenantModule } from "@/lib/require-module";
import { BundleServiceError } from "@/modules/cpq/bundles/bundle.service";
import { convertQuoteToBundle } from "@/modules/cpq/bundles/convert-quote-to-bundle.service";

export const runtime = "nodejs";

export async function POST(
  _request: NextRequest,
  { params }: { params: Promise<{ id: string }> },
) {
  try {
    const modCheck = await requireTenantModule("cpq");
    if (!modCheck.authorized) return modCheck.response;

    const ctx = await requireAuth();
    if (!ctx) return unauthorized();
    const forbidden = await requireCpqEdit(ctx);
    if (forbidden) return forbidden;

    const { id: quoteId } = await params;

    try {
      const result = await convertQuoteToBundle({
        tenantId: ctx.tenantId,
        quoteId,
        userId: ctx.userId,
      });
      return NextResponse.json(
        { success: true, data: result },
        { status: result.existing ? 200 : 201 },
      );
    } catch (e) {
      if (e instanceof BundleServiceError) {
        return NextResponse.json(
          { success: false, error: e.message, code: e.code },
          { status: e.status },
        );
      }
      throw e;
    }
  } catch (error) {
    console.error("[cpq/quotes/convert-to-bundle]", error);
    return NextResponse.json(
      { success: false, error: "Error al convertir en propuesta" },
      { status: 500 },
    );
  }
}
