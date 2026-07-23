import { NextRequest, NextResponse } from "next/server";
import { flowV3Error, requireFlowV3 } from "@/modules/finance/flow-v3/api-guard";
import { getV3WeeklyCloseSnapshot } from "@/modules/finance/flow-v3/weekly-close.adapter";

export const dynamic = "force-dynamic";

/** Snapshot de cierre (saldo banco sugerido + varianza + contadores) para la
 *  semana v3 que contiene ?weekEnd=YYYY-MM-DD. */
export async function GET(request: NextRequest) {
  try {
    const guard = await requireFlowV3("cashflow_manage");
    if (guard.error) return guard.error;
    const weekEnd = new URL(request.url).searchParams.get("weekEnd");
    if (!weekEnd || !/^\d{4}-\d{2}-\d{2}$/.test(weekEnd)) {
      return NextResponse.json({ success: false, error: "weekEnd inválido" }, { status: 400 });
    }
    const snap = await getV3WeeklyCloseSnapshot(guard.ctx.tenantId, weekEnd);
    return NextResponse.json({ success: true, data: snap });
  } catch (error) {
    console.error("[Finance/FlowV3] GET weekly-close/snapshot:", error);
    return flowV3Error(error);
  }
}
