import { NextResponse } from "next/server";
import {
  requireAuth,
  unauthorized,
  resolveApiPerms,
} from "@/lib/api-auth";
import { hasCapability } from "@/lib/permissions";
import { seedAccountPlan } from "@/modules/finance/accounting/account-plan.service";

export async function POST() {
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

    const result = await seedAccountPlan(ctx.tenantId);
    return NextResponse.json(
      { success: true, data: result },
      { status: 201 }
    );
  } catch (error) {
    console.error("[Finance Accounts Seed] Error:", error);
    return NextResponse.json(
      { success: false, error: "Error al inicializar plan de cuentas" },
      { status: 500 }
    );
  }
}
