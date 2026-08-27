import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import {
  requireAuth,
  unauthorized,
  resolveApiPerms,
  parseBody,
} from "@/lib/api-auth";
import { hasFacturacionCapability } from "@/lib/permissions";
import { resendIssuedDteToSelectedContacts } from "@/modules/finance/billing/dte-email.service";

const bodySchema = z.object({
  emails: z
    .array(z.string().email())
    .min(1, "Selecciona al menos un destinatario")
    .max(15, "Máximo 15 destinatarios"),
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

    const result = await resendIssuedDteToSelectedContacts(
      ctx.tenantId,
      id,
      parsed.data.emails,
      ctx.userId,
    );

    if (!result.success) {
      return NextResponse.json(
        { success: false, error: result.error, data: result },
        { status: 500 },
      );
    }
    return NextResponse.json({
      success: true,
      data: {
        xmlMailbox: result.xmlMailbox ?? null,
        others: result.others ?? null,
      },
    });
  } catch (error) {
    console.error("[Finance/Billing] Resend XML error:", error);
    const message =
      error instanceof Error ? error.message : "Error al reenviar XML";
    return NextResponse.json(
      { success: false, error: message },
      { status: 500 },
    );
  }
}
