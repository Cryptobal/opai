import { NextRequest, NextResponse } from "next/server";
import {
  requireAuth,
  unauthorized,
  resolveApiPerms,
  parseBody,
} from "@/lib/api-auth";
import { canView, hasCapability } from "@/lib/permissions";
import { createAccountSchema } from "@/lib/validations/finance";
import {
  getAccountTree,
  createAccount,
} from "@/modules/finance/accounting/account-plan.service";

export async function GET() {
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

    const tree = await getAccountTree(ctx.tenantId);
    return NextResponse.json({ success: true, data: tree });
  } catch (error) {
    console.error("[Finance Accounts] Error:", error);
    return NextResponse.json(
      { success: false, error: "Error al obtener plan de cuentas" },
      { status: 500 }
    );
  }
}

export async function POST(request: NextRequest) {
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

    const parsed = await parseBody(request, createAccountSchema);
    if (parsed.error) return parsed.error;
    const body = parsed.data;

    const account = await createAccount(ctx.tenantId, body);
    return NextResponse.json(
      { success: true, data: account },
      { status: 201 }
    );
  } catch (error) {
    console.error("[Finance Accounts] Error:", error);
    return NextResponse.json(
      { success: false, error: "Error al crear cuenta" },
      { status: 500 }
    );
  }
}
