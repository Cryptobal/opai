import { NextRequest, NextResponse } from "next/server";
import { requireAuth, unauthorized, resolveApiPerms } from "@/lib/api-auth";
import { hasCapability } from "@/lib/permissions";
import { searchDtesForFlow } from "@/modules/finance/cashflow/dte-flow-search.service";

export async function GET(request: NextRequest) {
  try {
    const ctx = await requireAuth();
    if (!ctx) return unauthorized();
    const perms = await resolveApiPerms(ctx);
    if (!hasCapability(perms, "cashflow_view")) {
      return NextResponse.json({ success: false, error: "Sin permisos" }, { status: 403 });
    }
    const q = new URL(request.url).searchParams.get("q") ?? "";
    if (q.trim().length === 0) {
      return NextResponse.json({ success: true, data: [] });
    }
    const results = await searchDtesForFlow(ctx.tenantId, q);
    return NextResponse.json({ success: true, data: results });
  } catch (error) {
    console.error("[Finance/Cashflow] GET dte-search:", error);
    return NextResponse.json({ success: false, error: "Error interno" }, { status: 500 });
  }
}
