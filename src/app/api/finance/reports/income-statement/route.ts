import { NextRequest, NextResponse } from "next/server";
import { requireAuth, unauthorized, resolveApiPerms, parseBody } from "@/lib/api-auth";
import { canView, hasCapability } from "@/lib/permissions";
import { reportRequestSchema } from "@/lib/validations/finance-reports";
import { getIncomeStatement } from "@/modules/finance/reports/income-statement.service";

export async function POST(request: NextRequest) {
  const ctx = await requireAuth();
  if (!ctx) return unauthorized();
  const perms = await resolveApiPerms(ctx);
  if (!canView(perms, "finance", "reportes") && !hasCapability(perms, "finance_reports_view")) {
    return NextResponse.json({ success: false, error: "Sin permisos" }, { status: 403 });
  }
  const parsed = await parseBody(request, reportRequestSchema);
  if (parsed.error) return parsed.error;
  try {
    const data = await getIncomeStatement(
      ctx.tenantId,
      parsed.data.period,
      parsed.data.filters,
      { withComparison: parsed.data.withComparison ?? false }
    );
    return NextResponse.json({ success: true, data });
  } catch (e) {
    console.error("[Reports] income-statement error", e);
    return NextResponse.json(
      { success: false, error: "Error generando reporte" },
      { status: 500 }
    );
  }
}
