import { NextRequest, NextResponse } from "next/server";
import { requireAuth, unauthorized, resolveApiPerms } from "@/lib/api-auth";
import { canView } from "@/lib/permissions";
import { getFolioStatus } from "@/modules/finance/billing/folio.service";

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

    const status = await getFolioStatus(ctx.tenantId);

    return NextResponse.json({ success: true, data: status });
  } catch (error) {
    console.error("[Finance/Billing] Error getting folio status:", error);
    return NextResponse.json(
      { success: false, error: "Error al obtener estado de folios" },
      { status: 500 }
    );
  }
}
