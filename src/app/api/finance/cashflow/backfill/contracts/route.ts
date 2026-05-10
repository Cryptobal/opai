import { NextResponse } from "next/server";
import { requireAuth, unauthorized, resolveApiPerms } from "@/lib/api-auth";
import { hasCapability } from "@/lib/permissions";
import { backfillContractItems } from "@/modules/finance/cashflow/generators/sales-contract-sync";

export async function POST() {
  try {
    const ctx = await requireAuth();
    if (!ctx) return unauthorized();
    const perms = await resolveApiPerms(ctx);
    if (!hasCapability(perms, "cashflow_configure")) {
      return NextResponse.json({ success: false, error: "Sin permisos" }, { status: 403 });
    }
    const stats = await backfillContractItems(ctx.tenantId);
    return NextResponse.json({ success: true, data: stats });
  } catch (error) {
    console.error("[Finance/Cashflow] Backfill contracts error:", error);
    return NextResponse.json({ success: false, error: "Error interno" }, { status: 500 });
  }
}
