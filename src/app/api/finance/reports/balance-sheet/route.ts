import { NextRequest, NextResponse } from "next/server";
import { requireAuth, unauthorized, resolveApiPerms, parseBody } from "@/lib/api-auth";
import { canView, hasCapability } from "@/lib/permissions";
import { balanceRequestSchema } from "@/lib/validations/finance-reports";
import { getBalanceSheet } from "@/modules/finance/reports/balance-sheet.service";

export async function POST(request: NextRequest) {
  const ctx = await requireAuth();
  if (!ctx) return unauthorized();
  const perms = await resolveApiPerms(ctx);
  if (!canView(perms, "finance", "reportes") && !hasCapability(perms, "finance_reports_view")) {
    return NextResponse.json({ success: false, error: "Sin permisos" }, { status: 403 });
  }
  const parsed = await parseBody(request, balanceRequestSchema);
  if (parsed.error) return parsed.error;
  try {
    const data = await getBalanceSheet(
      ctx.tenantId,
      parsed.data.asOf,
      parsed.data.filters,
      { withPriorMonth: parsed.data.withPriorMonth ?? false }
    );
    return NextResponse.json({ success: true, data });
  } catch (e) {
    console.error("[Reports] balance-sheet error", e);
    return NextResponse.json(
      { success: false, error: "Error generando reporte" },
      { status: 500 }
    );
  }
}
