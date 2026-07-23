import { NextRequest, NextResponse } from "next/server";
import { flowV3Error, requireFlowV3 } from "@/modules/finance/flow-v3/api-guard";
import { movePlanCell } from "@/modules/finance/flow-v3/plan.service";
import { assertV3WeeksWritable } from "@/modules/finance/flow-v3/weekly-close.adapter";
import { flowPlanMoveSchema } from "@/lib/validations/flow-v3";

export const dynamic = "force-dynamic";

/** Mueve el plan de una semana a otra (misma fila). Rechaza semanas selladas.
 *  Devuelve ambas celdas releídas de DB. */
export async function POST(request: NextRequest) {
  try {
    const guard = await requireFlowV3("cashflow_manage");
    if (guard.error) return guard.error;
    const parsed = flowPlanMoveSchema.safeParse(await request.json());
    if (!parsed.success) {
      const issues = parsed.error.issues.map((i) => i.message).join("; ");
      return NextResponse.json({ success: false, error: issues }, { status: 400 });
    }
    const { rowId, fromWeek, toWeek } = parsed.data;
    await assertV3WeeksWritable(guard.ctx.tenantId, [fromWeek, toWeek]);
    const result = await movePlanCell(guard.ctx.tenantId, rowId, fromWeek, toWeek, guard.ctx.userId);
    return NextResponse.json({ success: true, data: result });
  } catch (error) {
    console.error("[Finance/FlowV3] POST plan/move:", error);
    return flowV3Error(error);
  }
}
