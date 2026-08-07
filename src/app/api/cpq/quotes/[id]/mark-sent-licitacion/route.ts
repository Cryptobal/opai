/**
 * API Route: /api/cpq/quotes/[id]/mark-sent-licitacion
 * POST - Marca cotización como enviada (flujo licitación, sin portal).
 * Requiere negocio con isLicitacion; avanza a etapa Negociación.
 */

import { NextRequest, NextResponse } from "next/server";
import { requireAuth, unauthorized } from "@/lib/api-auth";
import { requireCpqEdit } from "@/lib/api-auth-cpq";
import { requireTenantModule } from "@/lib/require-module";
import {
  markQuoteSentLicitacion,
  MarkQuoteSentLicitacionError,
} from "@/modules/cpq/send/mark-quote-sent-licitacion";

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

    const { id } = await params;
    const result = await markQuoteSentLicitacion({
      quoteId: id,
      tenantId: ctx.tenantId,
      userId: ctx.userId,
    });

    return NextResponse.json({ success: true, data: result });
  } catch (error) {
    if (error instanceof MarkQuoteSentLicitacionError) {
      return NextResponse.json(
        { success: false, error: error.message },
        { status: error.status },
      );
    }
    console.error("[CPQ] mark-sent-licitacion:", error);
    const message =
      error instanceof Error ? error.message : "No se pudo marcar como enviada";
    return NextResponse.json({ success: false, error: message }, { status: 500 });
  }
}
