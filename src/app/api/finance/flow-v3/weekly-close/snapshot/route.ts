import { NextRequest, NextResponse } from "next/server";
import { flowV3Error, requireFlowV3 } from "@/modules/finance/flow-v3/api-guard";
import { getV3WeeklyCloseSnapshotLite } from "@/modules/finance/flow-v3/weekly-close.adapter";

export const dynamic = "force-dynamic";

/** Snapshot lite de cierre (saldo banco + contadores; sin proyección v2).
 *  El proyectado lo aporta el cliente desde la matriz. ?weekEnd=YYYY-MM-DD. */
export async function GET(request: NextRequest) {
  try {
    const guard = await requireFlowV3("cashflow_manage");
    if (guard.error) return guard.error;
    const weekEnd = new URL(request.url).searchParams.get("weekEnd");
    if (!weekEnd || !/^\d{4}-\d{2}-\d{2}$/.test(weekEnd)) {
      return NextResponse.json({ success: false, error: "weekEnd inválido" }, { status: 400 });
    }
    const snap = await getV3WeeklyCloseSnapshotLite(guard.ctx.tenantId, weekEnd);
    return NextResponse.json({ success: true, data: snap });
  } catch (error) {
    console.error("[Finance/FlowV3] GET weekly-close/snapshot:", error);
    return flowV3Error(error);
  }
}
