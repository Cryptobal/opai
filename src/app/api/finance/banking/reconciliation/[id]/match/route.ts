import { NextRequest, NextResponse } from "next/server";
import { requireAuth, unauthorized, resolveApiPerms, parseBody } from "@/lib/api-auth";
import { hasCapability } from "@/lib/permissions";
import { reconciliationMatchSchema } from "@/lib/validations/finance";
import { addReconciliationMatch } from "@/modules/finance/banking/reconciliation.service";

export async function POST(request: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  try {
    const ctx = await requireAuth();
    if (!ctx) return unauthorized();
    const perms = await resolveApiPerms(ctx);
    if (!hasCapability(perms, "rendicion_configure")) {
      return NextResponse.json({ success: false, error: "Sin permisos" }, { status: 403 });
    }
    const { id } = await params;
    const parsed = await parseBody(request, reconciliationMatchSchema);
    if (parsed.error) return parsed.error;
    const match = await addReconciliationMatch(id, ctx.userId, parsed.data);
    return NextResponse.json({ success: true, data: match }, { status: 201 });
  } catch (error) {
    console.error("[Finance/Reconciliation] Error matching:", error);
    return NextResponse.json({ success: false, error: "Error al conciliar movimiento" }, { status: 500 });
  }
}
