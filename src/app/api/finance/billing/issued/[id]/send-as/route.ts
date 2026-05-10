/**
 * POST /api/finance/billing/issued/[id]/send-as
 *
 * Envía Estado de Pago de un DTE ya emitido al SII (caso típico: el
 * cliente pide el "Estado de Pago" mensual aunque la factura ya esté
 * en el SII). NO permite Proforma (no tiene sentido para un emitido).
 *
 * Permisos: facturacion_resend_email.
 */

import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import {
  parseBody,
  requireAuth,
  resolveApiPerms,
  unauthorized,
} from "@/lib/api-auth";
import { hasFacturacionCapability } from "@/lib/permissions";
import { sendBillingDocument } from "@/modules/finance/billing/billing-document-send.service";

const sendAsSchema = z.object({
  variant: z.literal("ESTADO_DE_PAGO"),
  recipientEmail: z.string().email().optional(),
  ccEmails: z.array(z.string().email()).max(10).optional(),
  bccEmails: z.array(z.string().email()).max(10).optional(),
  customSubject: z.string().max(200).optional(),
  customIntroHtml: z.string().max(5000).optional(),
  signerOverrides: z.array(z.string()).max(3).optional(),
});

export const runtime = "nodejs";

export async function POST(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> },
) {
  try {
    const ctx = await requireAuth();
    if (!ctx) return unauthorized();
    const perms = await resolveApiPerms(ctx);
    if (!hasFacturacionCapability(perms, "facturacion_resend_email")) {
      return NextResponse.json(
        { success: false, error: "Sin permisos" },
        { status: 403 },
      );
    }

    const { id } = await params;
    const parsed = await parseBody(request, sendAsSchema);
    if (parsed.error) return parsed.error;

    const result = await sendBillingDocument(ctx.tenantId, {
      dteId: id,
      variant: parsed.data.variant,
      recipientEmail: parsed.data.recipientEmail ?? null,
      ccEmails: parsed.data.ccEmails,
      bccEmails: parsed.data.bccEmails,
      customSubject: parsed.data.customSubject ?? null,
      customIntroHtml: parsed.data.customIntroHtml ?? null,
      signerOverrides: parsed.data.signerOverrides,
      triggeredBy: ctx.userId,
    });

    if (!result.success) {
      return NextResponse.json(
        { success: false, error: result.error ?? "Error al enviar" },
        { status: 400 },
      );
    }
    return NextResponse.json({ success: true, data: result });
  } catch (err) {
    const message = err instanceof Error ? err.message : "Error";
    return NextResponse.json(
      { success: false, error: message },
      { status: 500 },
    );
  }
}
