import { NextRequest, NextResponse } from "next/server";
import { requireAuth, unauthorized, resolveApiPerms } from "@/lib/api-auth";
import { canEdit, hasCapability } from "@/lib/permissions";
import { checkPendingRounds } from "@/lib/rondas/alert-engine";

export async function POST(_request: NextRequest) {
  try {
    const ctx = await requireAuth();
    if (!ctx) return unauthorized();
    const perms = await resolveApiPerms(ctx);
    if (!canEdit(perms, "ops", "rondas") || !hasCapability(perms, "rondas_configure")) {
      return NextResponse.json({ success: false, error: "Sin permisos" }, { status: 403 });
    }

    const result = await checkPendingRounds(ctx.tenantId);
    return NextResponse.json({ success: true, data: result });
  } catch (error) {
    console.error("[RONDAS] POST cron check-pending", error);
    return NextResponse.json({ success: false, error: "Error interno" }, { status: 500 });
  }
}
