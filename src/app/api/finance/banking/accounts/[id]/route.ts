import { NextRequest, NextResponse } from "next/server";
import {
  requireAuth,
  unauthorized,
  resolveApiPerms,
  parseBody,
} from "@/lib/api-auth";
import { canView, hasCapability } from "@/lib/permissions";
import { updateBankAccountSchema } from "@/lib/validations/finance";
import {
  getBankAccount,
  updateBankAccount,
  deleteBankAccount,
} from "@/modules/finance/banking/bank-account.service";

export async function GET(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const ctx = await requireAuth();
    if (!ctx) return unauthorized();
    const perms = await resolveApiPerms(ctx);
    if (!canView(perms, "finance")) {
      return NextResponse.json(
        { success: false, error: "Sin permisos" },
        { status: 403 }
      );
    }

    const { id } = await params;

    const account = await getBankAccount(ctx.tenantId, id);

    if (!account) {
      return NextResponse.json(
        { success: false, error: "Cuenta bancaria no encontrada" },
        { status: 404 }
      );
    }

    return NextResponse.json({ success: true, data: account });
  } catch (error) {
    console.error("[Finance/Banking] Error getting bank account:", error);
    return NextResponse.json(
      { success: false, error: "Error al obtener cuenta bancaria" },
      { status: 500 }
    );
  }
}

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

    const parsed = await parseBody(request, updateBankAccountSchema);
    if (parsed.error) return parsed.error;
    const body = parsed.data;

    const account = await updateBankAccount(ctx.tenantId, id, body);

    return NextResponse.json({ success: true, data: account });
  } catch (error) {
    console.error("[Finance/Banking] Error updating bank account:", error);
    return NextResponse.json(
      { success: false, error: "Error al actualizar cuenta bancaria" },
      { status: 500 }
    );
  }
}

export async function DELETE(
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

    await deleteBankAccount(ctx.tenantId, id);

    return NextResponse.json({ success: true, data: { deleted: true } });
  } catch (error) {
    const msg =
      error instanceof Error ? error.message : "Error al eliminar cuenta";
    console.error("[Finance/Banking] Error deleting bank account:", error);
    return NextResponse.json(
      { success: false, error: msg },
      { status: 500 }
    );
  }
}
