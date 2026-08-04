import { NextResponse } from "next/server";
import { flowV3Error, requireFlowV3 } from "@/modules/finance/flow-v3/api-guard";
import { listOldPortfolio } from "@/modules/finance/flow-v3/old-portfolio.service";

export const dynamic = "force-dynamic";

export async function GET() {
  try {
    const guard = await requireFlowV3("cashflow_view");
    if (guard.error) return guard.error;
    const data = await listOldPortfolio(guard.ctx.tenantId);
    return NextResponse.json({ success: true, data });
  } catch (error) {
    console.error("[Finance/FlowV3] GET old-portfolio:", error);
    return flowV3Error(error);
  }
}
