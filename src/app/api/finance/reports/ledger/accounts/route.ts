import { NextResponse } from "next/server";
import { requireAuth, unauthorized, resolveApiPerms } from "@/lib/api-auth";
import { canView, hasCapability } from "@/lib/permissions";
import { listAccountsForLedger } from "@/modules/finance/reports/ledger-extended.service";

export async function GET() {
  const ctx = await requireAuth();
  if (!ctx) return unauthorized();
  const perms = await resolveApiPerms(ctx);
  if (!canView(perms, "finance", "reportes") && !hasCapability(perms, "finance_reports_view")) {
    return NextResponse.json({ success: false, error: "Sin permisos" }, { status: 403 });
  }
  try {
    const data = await listAccountsForLedger(ctx.tenantId);
    return NextResponse.json({ success: true, data });
  } catch (e) {
    console.error("[Reports] ledger accounts error", e);
    return NextResponse.json(
      { success: false, error: "Error listando cuentas" },
      { status: 500 }
    );
  }
}
