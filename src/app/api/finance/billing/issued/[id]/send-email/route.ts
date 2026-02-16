import { NextRequest, NextResponse } from "next/server";
import {
  requireAuth,
  unauthorized,
  resolveApiPerms,
  parseBody,
} from "@/lib/api-auth";
import { hasCapability } from "@/lib/permissions";
import { sendDteEmail } from "@/modules/finance/billing/dte-email.service";
import { z } from "zod";

const emailSchema = z.object({
  email: z.string().email(),
});

export async function POST(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const ctx = await requireAuth();
    if (!ctx) return unauthorized();
    const perms = await resolveApiPerms(ctx);
    if (!hasCapability(perms, "rendicion_configure")) {
      return NextResponse.json(
        { success: false, error: "Sin permisos" },
        { status: 403 }
      );
    }

    const { id } = await params;

    const parsed = await parseBody(request, emailSchema);
    if (parsed.error) return parsed.error;
    const body = parsed.data;

    await sendDteEmail(ctx.tenantId, id, body.email);

    return NextResponse.json({
      success: true,
      message: "Email enviado correctamente",
    });
  } catch (error) {
    console.error("[Finance/Billing] Error sending email:", error);
    return NextResponse.json(
      { success: false, error: "Error al enviar email" },
      { status: 500 }
    );
  }
}
