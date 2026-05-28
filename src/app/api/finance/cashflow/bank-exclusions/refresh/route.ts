import { NextResponse } from "next/server";
import { requireAuth, unauthorized, resolveApiPerms } from "@/lib/api-auth";
import { hasCapability } from "@/lib/permissions";
import { applyExclusionRules } from "@/modules/finance/cashflow/exclusion-rules.service";

/**
 * POST /api/finance/cashflow/bank-exclusions/refresh
 *
 * Re-aplica las reglas de exclusión automática (transferencias internas +
 * comisiones bajo umbral) sobre las bank tx de los últimos 90 días del tenant.
 * Idempotente. No toca las marcadas manual_override.
 */
export async function POST() {
  const ctx = await requireAuth();
  if (!ctx) return unauthorized();
  const perms = await resolveApiPerms(ctx);
  if (!hasCapability(perms, "cashflow_manage")) {
    return NextResponse.json({ success: false, error: "Sin permisos" }, { status: 403 });
  }
  try {
    const result = await applyExclusionRules(ctx.tenantId, ctx.userId);
    return NextResponse.json({ success: true, data: result });
  } catch (e) {
    return NextResponse.json(
      { success: false, error: e instanceof Error ? e.message : "Error" },
      { status: 400 },
    );
  }
}
