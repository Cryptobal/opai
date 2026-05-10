/**
 * POST /api/finance/billing/drafts/[id]/send-as
 *
 * Envía el documento de cobro (Proforma | Estado de Pago) por email al
 * cliente. Requiere que el DTE esté en estado DRAFT (siiStatus=DRAFT).
 * Para reenvío de DTEs ya emitidos, usar /issued/[id]/send-as.
 *
 * Permisos: facturacion_create_draft (no `_view`, porque sí muta estado).
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
  variant: z.enum(["PROFORMA", "ESTADO_DE_PAGO"]),
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
    if (
      !hasFacturacionCapability(perms, "facturacion_create_draft") &&
      !hasFacturacionCapability(perms, "facturacion_issue") &&
      !hasFacturacionCapability(perms, "facturacion_resend_email")
    ) {
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
