import { NextRequest, NextResponse } from "next/server";
import { flowV3Error, requireFlowV3 } from "@/modules/finance/flow-v3/api-guard";
import { upsertBalanceAnchor } from "@/modules/finance/flow-v3/balance-anchor.service";
import { flowBalanceAnchorSchema } from "@/lib/validations/flow-v3";

export const dynamic = "force-dynamic";

/**
 * Ancla manual de saldo acumulado. `balanceClp: null` borra el ancla.
 * Semanas cerradas se rechazan (assertV3WeeksWritable).
 */
export async function PATCH(request: NextRequest) {
  try {
    const guard = await requireFlowV3("cashflow_manage");
    if (guard.error) return guard.error;
    const parsed = flowBalanceAnchorSchema.safeParse(await request.json());
    if (!parsed.success) {
      const issues = parsed.error.issues.map((i) => i.message).join("; ");
      return NextResponse.json({ success: false, error: issues }, { status: 400 });
    }
    const data = await upsertBalanceAnchor(
      guard.ctx.tenantId,
      parsed.data.weekStart,
      parsed.data.balanceClp,
    );
    return NextResponse.json({ success: true, data });
  } catch (error) {
    console.error("[Finance/FlowV3] PATCH balance-anchor:", error);
    return flowV3Error(error);
  }
}
