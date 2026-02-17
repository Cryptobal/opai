import { NextRequest, NextResponse } from "next/server";
import {
  requireAuth,
  unauthorized,
  resolveApiPerms,
  parseBody,
} from "@/lib/api-auth";
import { canView, hasCapability } from "@/lib/permissions";
import { createBankAccountSchema } from "@/lib/validations/finance";
import {
  listBankAccounts,
  createBankAccount,
} from "@/modules/finance/banking/bank-account.service";

export async function GET(request: NextRequest) {
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

    const accounts = await listBankAccounts(ctx.tenantId);

    return NextResponse.json({ success: true, data: accounts });
  } catch (error) {
    console.error("[Finance/Banking] Error listing bank accounts:", error);
    return NextResponse.json(
      { success: false, error: "Error al listar cuentas bancarias" },
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

    const parsed = await parseBody(request, createBankAccountSchema);
    if (parsed.error) return parsed.error;
    const body = parsed.data;

    const account = await createBankAccount(ctx.tenantId, body);

    return NextResponse.json(
      { success: true, data: account },
      { status: 201 }
    );
  } catch (error) {
    console.error("[Finance/Banking] Error creating bank account:", error);
    return NextResponse.json(
      { success: false, error: "Error al crear cuenta bancaria" },
      { status: 500 }
    );
  }
}
