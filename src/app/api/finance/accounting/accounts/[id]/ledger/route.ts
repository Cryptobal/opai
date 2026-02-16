import { NextRequest, NextResponse } from "next/server";
import {
  requireAuth,
  unauthorized,
  resolveApiPerms,
} from "@/lib/api-auth";
import { canView } from "@/lib/permissions";
import { getAccountLedger } from "@/modules/finance/accounting/ledger.service";

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
    const { searchParams } = new URL(request.url);
    const dateFrom = searchParams.get("dateFrom") || undefined;
    const dateTo = searchParams.get("dateTo") || undefined;

    const ledger = await getAccountLedger(ctx.tenantId, id, dateFrom, dateTo);
    return NextResponse.json({ success: true, data: ledger });
  } catch (error) {
    console.error("[Finance Account Ledger] Error:", error);
    return NextResponse.json(
      { success: false, error: "Error al obtener libro mayor" },
      { status: 500 }
    );
  }
}
