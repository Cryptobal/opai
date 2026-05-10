import { NextRequest, NextResponse } from "next/server";
import { requireAuth, unauthorized, resolveApiPerms } from "@/lib/api-auth";
import { hasCapability } from "@/lib/permissions";
import { setContractItemsActive } from "@/modules/finance/cashflow/generators/sales-contract-sync";
import { updateCashflowConfig } from "@/modules/finance/cashflow/config.service";

export async function POST(request: NextRequest) {
  try {
    const ctx = await requireAuth();
    if (!ctx) return unauthorized();
    const perms = await resolveApiPerms(ctx);
    if (!hasCapability(perms, "cashflow_configure")) {
      return NextResponse.json({ success: false, error: "Sin permisos" }, { status: 403 });
    }
    const body = (await request.json().catch(() => null)) as { enabled?: unknown } | null;
    if (!body || typeof body.enabled !== "boolean") {
      return NextResponse.json(
        { success: false, error: "Falta enabled:boolean" },
        { status: 400 },
      );
    }
    const enabled = body.enabled;
    const result = await setContractItemsActive(ctx.tenantId, enabled);
    await updateCashflowConfig(ctx.tenantId, { autoSales: enabled });
    return NextResponse.json({ success: true, data: result });
  } catch (error) {
    console.error("[Finance/Cashflow] auto-sales-toggle error:", error);
    return NextResponse.json({ success: false, error: "Error interno" }, { status: 500 });
  }
}
