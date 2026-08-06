import { NextRequest, NextResponse } from "next/server";
import {
  requireAuth,
  unauthorized,
  resolveApiPerms,
  parseBody,
} from "@/lib/api-auth";
import { hasCapability } from "@/lib/permissions";
import { updateAccountSchema } from "@/lib/validations/finance";
import {
  deleteAccount,
  updateAccount,
} from "@/modules/finance/accounting/account-plan.service";

function canManageAccounts(
  perms: Awaited<ReturnType<typeof resolveApiPerms>>,
): boolean {
  return (
    hasCapability(perms, "contabilidad_manage") ||
    hasCapability(perms, "rendicion_configure")
  );
}

export async function PUT(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const ctx = await requireAuth();
    if (!ctx) return unauthorized();
    const perms = await resolveApiPerms(ctx);
    if (!canManageAccounts(perms)) {
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

export async function DELETE(
  _request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const ctx = await requireAuth();
    if (!ctx) return unauthorized();
    const perms = await resolveApiPerms(ctx);
    if (!canManageAccounts(perms)) {
      return NextResponse.json(
        { success: false, error: "Sin permisos" },
        { status: 403 }
      );
    }

    const { id } = await params;
    const result = await deleteAccount(ctx.tenantId, id);
    return NextResponse.json({ success: true, data: result });
  } catch (error) {
    const msg =
      error instanceof Error ? error.message : "Error al eliminar cuenta";
    console.error("[Finance Accounts] Error deleting:", error);
    return NextResponse.json({ success: false, error: msg }, { status: 400 });
  }
}
