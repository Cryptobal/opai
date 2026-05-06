import { NextRequest, NextResponse } from "next/server";
import {
  requireAuth,
  unauthorized,
  resolveApiPerms,
  parseBody,
} from "@/lib/api-auth";
import { hasFacturacionCapability } from "@/lib/permissions";
import { z } from "zod";
import { sendDteEmail } from "@/modules/finance/billing/dte-email.service";

const sendSchema = z.object({
  recipientEmail: z.string().email().optional(),
  // Override de los CC al reenviar manualmente (sin tocar receiverEmailCc).
  ccOverride: z.array(z.string().email()).max(10).optional(),
});

export async function POST(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const ctx = await requireAuth();
  if (!ctx) return unauthorized();
  const perms = await resolveApiPerms(ctx);
  if (!hasFacturacionCapability(perms, "facturacion_resend_email")) {
    return NextResponse.json(
      {
        success: false,
        error: "No tiene permiso para reenviar emails de DTE",
      },
      { status: 403 }
    );
  }

  const { id } = await params;
  const parsed = await parseBody(request, sendSchema);
  if (parsed.error) return parsed.error;

  // Distinguir si es reenvío al mismo email del receptor o a otro distinto:
  // permite filtrar logs y mostrar timeline con etiquetas claras.
  const kind = parsed.data.recipientEmail
    ? "manual_override_recipient"
    : "manual_resend";
  const result = await sendDteEmail(
    ctx.tenantId,
    id,
    parsed.data.recipientEmail,
    parsed.data.ccOverride,
    kind,
    ctx.userId,
  );
  if (!result.success) {
    return NextResponse.json(
      { success: false, error: result.error },
      { status: 500 }
    );
  }
  return NextResponse.json({
    success: true,
    data: { messageId: result.messageId },
  });
}
