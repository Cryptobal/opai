import { NextRequest, NextResponse } from "next/server";
import { requireAuth, unauthorized, resolveApiPerms } from "@/lib/api-auth";
import { canView } from "@/lib/permissions";
import { checkDteStatus } from "@/modules/finance/billing/dte-issuer.service";

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

    const status = await checkDteStatus(ctx.tenantId, id);

    return NextResponse.json({ success: true, data: status });
  } catch (error) {
    console.error("[Finance/Billing] Error checking DTE status:", error);
    return NextResponse.json(
      { success: false, error: "Error al verificar estado del DTE" },
      { status: 500 }
    );
  }
}
