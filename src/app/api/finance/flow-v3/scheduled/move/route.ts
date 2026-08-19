import { NextRequest, NextResponse } from "next/server";
import { flowV3Error, requireFlowV3 } from "@/modules/finance/flow-v3/api-guard";
import { moveScheduledQuota } from "@/modules/finance/flow-v3/scheduled-date-override.service";
import { flowScheduledMoveSchema } from "@/lib/validations/flow-v3";

export const dynamic = "force-dynamic";

/** Mueve una cuota programada (P) a otra semana. No toca facturas ni el template. */
export async function POST(request: NextRequest) {
  try {
    const guard = await requireFlowV3("cashflow_manage");
    if (guard.error) return guard.error;
    const parsed = flowScheduledMoveSchema.safeParse(await request.json());
    if (!parsed.success) {
      const issues = parsed.error.issues.map((i) => i.message).join("; ");
      return NextResponse.json({ success: false, error: issues }, { status: 400 });
    }
    const { templateId, billingPeriod, toWeek } = parsed.data;
    const result = await moveScheduledQuota({
      tenantId: guard.ctx.tenantId,
      templateId,
      billingPeriod,
      toWeek,
      createdBy: guard.ctx.userId,
    });
    return NextResponse.json({ success: true, data: result });
  } catch (error) {
    console.error("[Finance/FlowV3] POST scheduled/move:", error);
    return flowV3Error(error);
  }
}
