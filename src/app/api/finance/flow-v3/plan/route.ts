import { NextRequest, NextResponse } from "next/server";
import { flowV3Error, requireFlowV3 } from "@/modules/finance/flow-v3/api-guard";
import { upsertCell } from "@/modules/finance/flow-v3/plan.service";
import { assertV3WeeksWritable } from "@/modules/finance/flow-v3/weekly-close.adapter";
import { flowPlanUpsertSchema } from "@/lib/validations/flow-v3";

export const dynamic = "force-dynamic";

/** Upsert de una celda plan (amount 0 ⇒ delete). Read-after-write. */
export async function PATCH(request: NextRequest) {
  try {
    const guard = await requireFlowV3("cashflow_manage");
    if (guard.error) return guard.error;
    const parsed = flowPlanUpsertSchema.safeParse(await request.json());
    if (!parsed.success) {
      const issues = parsed.error.issues.map((i) => i.message).join("; ");
      return NextResponse.json({ success: false, error: issues }, { status: 400 });
    }
    await assertV3WeeksWritable(guard.ctx.tenantId, [parsed.data.weekStart]);
    const cell = await upsertCell(
      guard.ctx.tenantId,
      parsed.data.rowId,
      parsed.data.weekStart,
      parsed.data.amount,
      guard.ctx.userId,
    );
    return NextResponse.json({ success: true, data: cell });
  } catch (error) {
    console.error("[Finance/FlowV3] PATCH plan:", error);
    return flowV3Error(error);
  }
}
