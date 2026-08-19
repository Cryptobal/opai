import { NextRequest, NextResponse } from "next/server";
import { flowV3Error, requireFlowV3 } from "@/modules/finance/flow-v3/api-guard";
import { moveMilestoneQuota } from "@/modules/finance/flow-v3/milestone-date-override.service";
import { flowMilestoneMoveSchema } from "@/lib/validations/flow-v3";

export const dynamic = "force-dynamic";

/** Mueve un hito programado (quincena, sueldos, …). No cambia el día de pago. */
export async function POST(request: NextRequest) {
  try {
    const guard = await requireFlowV3("cashflow_manage");
    if (guard.error) return guard.error;
    const parsed = flowMilestoneMoveSchema.safeParse(await request.json());
    if (!parsed.success) {
      const issues = parsed.error.issues.map((i) => i.message).join("; ");
      return NextResponse.json({ success: false, error: issues }, { status: 400 });
    }
    const { milestoneKey, billingPeriod, toWeek } = parsed.data;
    const result = await moveMilestoneQuota({
      tenantId: guard.ctx.tenantId,
      milestoneKey,
      billingPeriod,
      toWeek,
      createdBy: guard.ctx.userId,
    });
    return NextResponse.json({ success: true, data: result });
  } catch (error) {
    console.error("[Finance/FlowV3] POST milestone/move:", error);
    return flowV3Error(error);
  }
}
