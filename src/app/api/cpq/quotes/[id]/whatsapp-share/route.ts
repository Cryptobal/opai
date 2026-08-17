/**
 * API: POST /api/cpq/quotes/[id]/whatsapp-share
 * Arma el mensaje WA (PIN + portal) sin reenviar el correo.
 */

import { NextRequest, NextResponse } from "next/server";
import { requireAuth, unauthorized } from "@/lib/api-auth";
import { requireCpqView } from "@/lib/api-auth-cpq";
import { requireTenantModule } from "@/lib/require-module";
import {
  buildQuotePortalWhatsAppShare,
  PortalWhatsAppShareError,
} from "@/modules/cpq/send/build-portal-whatsapp-share";

export async function POST(
  _request: NextRequest,
  { params }: { params: Promise<{ id: string }> },
) {
  try {
    const modCheck = await requireTenantModule("cpq");
    if (!modCheck.authorized) return modCheck.response;

    const ctx = await requireAuth();
    if (!ctx) return unauthorized();
    const forbidden = await requireCpqView(ctx);
    if (forbidden) return forbidden;

    const { id } = await params;
    const result = await buildQuotePortalWhatsAppShare({
      quoteId: id,
      tenantId: ctx.tenantId,
      userId: ctx.userId,
    });

    return NextResponse.json({ success: true, data: result });
  } catch (error) {
    console.error("[cpq/quotes/whatsapp-share]", error);
    const msg = error instanceof Error ? error.message : "Error al armar WhatsApp";
    const status = error instanceof PortalWhatsAppShareError ? 400 : 500;
    return NextResponse.json({ success: false, error: msg }, { status });
  }
}
