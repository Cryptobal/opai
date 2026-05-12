import { NextResponse } from "next/server";
import { requireAuth, unauthorized, resolveApiPerms } from "@/lib/api-auth";
import { hasCapability } from "@/lib/permissions";
import { migrateContractItemsToManual } from "@/modules/finance/cashflow/generators/sales-contract-sync";

/**
 * One-shot: migra items source=CONTRACT → source=OTHER para que pasen a ser
 * editables manualmente desde el dialog del CRM. Idempotente.
 *
 * El endpoint anterior (backfillContractItems) fue removido junto con el
 * auto-sync. Reutilizamos la misma URL para el caso de uso nuevo —
 * permisos iguales (cashflow_configure).
 */
export async function POST() {
  try {
    const ctx = await requireAuth();
    if (!ctx) return unauthorized();
    const perms = await resolveApiPerms(ctx);
    if (!hasCapability(perms, "cashflow_configure")) {
      return NextResponse.json({ success: false, error: "Sin permisos" }, { status: 403 });
    }
    const stats = await migrateContractItemsToManual(ctx.tenantId);
    return NextResponse.json({ success: true, data: stats });
  } catch (error) {
    console.error("[Finance/Cashflow] Migrate contracts error:", error);
    return NextResponse.json({ success: false, error: "Error interno" }, { status: 500 });
  }
}
