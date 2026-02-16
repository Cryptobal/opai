import { NextRequest, NextResponse } from "next/server";
import {
  requireAuth,
  unauthorized,
  resolveApiPerms,
  parseBody,
} from "@/lib/api-auth";
import { hasCapability } from "@/lib/permissions";
import { updateAccountSchema } from "@/lib/validations/finance";
import { updateAccount } from "@/modules/finance/accounting/account-plan.service";

export async function PUT(
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
    const parsed = await parseBody(request, updateAccountSchema);
    if (parsed.error) return parsed.error;
    const body = parsed.data;

    const account = await updateAccount(ctx.tenantId, id, body);
    return NextResponse.json({ success: true, data: account });
  } catch (error) {
    console.error("[Finance Accounts] Error:", error);
    return NextResponse.json(
      { success: false, error: "Error al actualizar cuenta" },
      { status: 500 }
    );
  }
}
