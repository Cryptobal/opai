import { NextRequest, NextResponse } from "next/server";
import { flowV3Error, requireFlowV3 } from "@/modules/finance/flow-v3/api-guard";
import { listPlanHistory } from "@/modules/finance/flow-v3/plan-history.service";
import { isMondayYmd } from "@/modules/finance/flow-v3/weeks";

export const dynamic = "force-dynamic";

/** Historial de cambios de plan de una celda (AuditLog). */
export async function GET(request: NextRequest) {
  try {
    const guard = await requireFlowV3("cashflow_view");
    if (guard.error) return guard.error;

    const rowId = request.nextUrl.searchParams.get("rowId")?.trim() ?? "";
    const weekStart = request.nextUrl.searchParams.get("weekStart")?.trim() ?? "";
    if (!rowId || !isMondayYmd(weekStart)) {
      return NextResponse.json(
        { success: false, error: "rowId y weekStart (lunes ISO) requeridos" },
        { status: 400 },
      );
    }

    const entries = await listPlanHistory(guard.ctx.tenantId, rowId, weekStart);
    return NextResponse.json({ success: true, data: entries });
  } catch (error) {
    console.error("[Finance/FlowV3] GET plan/history:", error);
    return flowV3Error(error);
  }
}
