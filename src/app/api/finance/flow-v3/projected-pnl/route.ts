import { NextRequest, NextResponse } from "next/server";
import { requireFlowV3, flowV3Error } from "@/modules/finance/flow-v3/api-guard";
import { buildProjectedPnl } from "@/modules/finance/flow-v3/projected-pnl.service";
import { flowProjectedPnlQuerySchema } from "@/lib/validations/flow-v3";

export const dynamic = "force-dynamic";

/** GET — P&L operativo proyectado (devengo, no caja). */
export async function GET(request: NextRequest) {
  const auth = await requireFlowV3("cashflow_view");
  if (auth.error) return auth.error;
  try {
    const url = new URL(request.url);
    const parsed = flowProjectedPnlQuerySchema.safeParse({
      from: url.searchParams.get("from") ?? undefined,
      to: url.searchParams.get("to") ?? undefined,
    });
    if (!parsed.success) {
      const issues = parsed.error.issues.map((i) => `${i.path.join(".")}: ${i.message}`).join("; ");
      return NextResponse.json({ success: false, error: issues }, { status: 400 });
    }
    const data = await buildProjectedPnl(auth.ctx.tenantId, {
      from: parsed.data.from,
      to: parsed.data.to,
    });
    return NextResponse.json({ success: true, data });
  } catch (error) {
    console.error("[Finance/FlowV3] GET projected-pnl:", error);
    return flowV3Error(error);
  }
}
