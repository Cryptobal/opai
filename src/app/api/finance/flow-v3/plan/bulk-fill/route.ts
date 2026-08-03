import { NextRequest, NextResponse } from "next/server";
import { flowV3Error, requireFlowV3 } from "@/modules/finance/flow-v3/api-guard";
import { bulkFill } from "@/modules/finance/flow-v3/plan.service";
import { assertV3WeeksWritable } from "@/modules/finance/flow-v3/weekly-close.adapter";
import { flowPlanBulkFillSchema } from "@/lib/validations/flow-v3";

export const dynamic = "force-dynamic";

/** Fill-right estilo Sheets: mismo monto en N semanas de una fila. */
export async function POST(request: NextRequest) {
  try {
    const guard = await requireFlowV3("cashflow_manage");
    if (guard.error) return guard.error;
    const parsed = flowPlanBulkFillSchema.safeParse(await request.json());
    if (!parsed.success) {
      const issues = parsed.error.issues.map((i) => i.message).join("; ");
      return NextResponse.json({ success: false, error: issues }, { status: 400 });
    }
    await assertV3WeeksWritable(guard.ctx.tenantId, parsed.data.weekStarts);
    const cells = await bulkFill(
      guard.ctx.tenantId,
      parsed.data.rowId,
      parsed.data.weekStarts,
      parsed.data.amount,
      guard.ctx.userId,
      { userId: guard.ctx.userId, userEmail: guard.ctx.userEmail },
    );
    return NextResponse.json({ success: true, data: cells });
  } catch (error) {
    console.error("[Finance/FlowV3] POST bulk-fill:", error);
    return flowV3Error(error);
  }
}
