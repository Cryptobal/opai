import { NextRequest, NextResponse } from "next/server";
import { flowV3Error, requireFlowV3 } from "@/modules/finance/flow-v3/api-guard";
import { upsertCellSettlement } from "@/modules/finance/flow-v3/cell-settlement.service";
import { assertV3WeeksWritable } from "@/modules/finance/flow-v3/weekly-close.adapter";
import { flowCellSettlementSchema } from "@/lib/validations/flow-v3";

export const dynamic = "force-dynamic";

/** Upsert / borrado del modo de liquidación de una celda (AUTO ⇒ delete). */
export async function PATCH(request: NextRequest) {
  try {
    const guard = await requireFlowV3("cashflow_manage");
    if (guard.error) return guard.error;
    const parsed = flowCellSettlementSchema.safeParse(await request.json());
    if (!parsed.success) {
      const issues = parsed.error.issues.map((i) => i.message).join("; ");
      return NextResponse.json({ success: false, error: issues }, { status: 400 });
    }
    await assertV3WeeksWritable(guard.ctx.tenantId, [parsed.data.weekStart]);
    const data = await upsertCellSettlement(
      guard.ctx.tenantId,
      parsed.data.rowId,
      parsed.data.weekStart,
      parsed.data.mode,
      parsed.data.projectedClp,
      guard.ctx.userId,
    );
    return NextResponse.json({ success: true, data });
  } catch (error) {
    console.error("[Finance/FlowV3] PATCH plan/settlement:", error);
    return flowV3Error(error);
  }
}
