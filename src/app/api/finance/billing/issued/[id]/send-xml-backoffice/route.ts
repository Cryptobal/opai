import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import {
  requireAuth,
  unauthorized,
  resolveApiPerms,
  parseBody,
} from "@/lib/api-auth";
import { hasFacturacionCapability } from "@/lib/permissions";
import { sendDteXmlToBackoffice } from "@/modules/finance/billing/dte-email.service";

const bodySchema = z.object({
  emailsOverride: z.array(z.string().email()).max(5).optional(),
});

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
        { success: false, error: "Sin permiso para reenviar emails" },
        { status: 403 },
      );
    }
    const { id } = await params;
    const parsed = await parseBody(request, bodySchema);
    if (parsed.error) return parsed.error;

    const result = await sendDteXmlToBackoffice(ctx.tenantId, id, {
      emailsOverride: parsed.data.emailsOverride,
      triggeredBy: ctx.userId,
      kindOverride: "manual_backoffice",
    });

    if (!result.success) {
      return NextResponse.json({ success: false, error: result.error }, { status: 500 });
    }
    return NextResponse.json({ success: true, data: { messageId: result.messageId } });
  } catch (error) {
    console.error("[Finance/Billing] Send XML backoffice error:", error);
    const message = error instanceof Error ? error.message : "Error al enviar XML al backoffice";
    return NextResponse.json({ success: false, error: message }, { status: 500 });
  }
}
