import { NextResponse } from "next/server";
import { requireAuth, unauthorized, resolveApiPerms } from "@/lib/api-auth";
import { hasCapability } from "@/lib/permissions";
import { deleteLegacyContractItems } from "@/modules/finance/cashflow/generators/sales-contract-sync";

/**
 * One-shot: borra los `FinanceCashflowItem` legacy con `source="CONTRACT"`
 * que quedaron en DB tras la migración a contratos 100% manuales (2026-05-11).
 * Los contratos ahora se agregan desde el tab "Contratos" de la cuenta CRM
 * con `source="OTHER"`. Idempotente.
 */
export async function POST() {
  try {
    const ctx = await requireAuth();
    if (!ctx) return unauthorized();
    const perms = await resolveApiPerms(ctx);
    if (!hasCapability(perms, "cashflow_configure")) {
      return NextResponse.json({ success: false, error: "Sin permisos" }, { status: 403 });
    }
    const stats = await deleteLegacyContractItems(ctx.tenantId);
    return NextResponse.json({ success: true, data: stats });
  } catch (error) {
    console.error("[Finance/Cashflow] Delete legacy contracts error:", error);
    return NextResponse.json({ success: false, error: "Error interno" }, { status: 500 });
  }
}
