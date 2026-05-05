import { NextRequest, NextResponse } from "next/server";
import {
  requireAuth,
  unauthorized,
  resolveApiPerms,
  parseBody,
} from "@/lib/api-auth";
import { canEdit } from "@/lib/permissions";
import { z } from "zod";
import { sendDteEmail } from "@/modules/finance/billing/dte-email.service";

const sendSchema = z.object({
  recipientEmail: z.string().email().optional(),
});

export async function POST(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const ctx = await requireAuth();
  if (!ctx) return unauthorized();
  const perms = await resolveApiPerms(ctx);
  if (!canEdit(perms, "finance", "facturacion")) {
    return NextResponse.json(
      { success: false, error: "Sin permisos" },
      { status: 403 }
    );
  }

  const { id } = await params;
  const parsed = await parseBody(request, sendSchema);
  if (parsed.error) return parsed.error;

  const result = await sendDteEmail(
    ctx.tenantId,
    id,
    parsed.data.recipientEmail
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
