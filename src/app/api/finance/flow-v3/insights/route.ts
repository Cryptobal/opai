import { NextResponse } from "next/server";
import { requireFlowV3, flowV3Error } from "@/modules/finance/flow-v3/api-guard";
import { buildFlowInsights } from "@/modules/finance/flow-v3/insights.service";

/** GET — datos del Panel (read-only). */
export async function GET() {
  const auth = await requireFlowV3("cashflow_view");
  if (auth.error) return auth.error;
  try {
    const data = await buildFlowInsights(auth.ctx.tenantId);
    return NextResponse.json({ success: true, data });
  } catch (error) {
    console.error("[Finance/FlowV3] GET insights:", error);
    return flowV3Error(error);
  }
}
