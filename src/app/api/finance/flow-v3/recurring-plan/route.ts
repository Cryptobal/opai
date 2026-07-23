import { NextRequest, NextResponse } from "next/server";
import { flowV3Error, requireFlowV3 } from "@/modules/finance/flow-v3/api-guard";
import { createRecurrence, toRecurrenceDto } from "@/modules/finance/flow-v3/recurring-plan.service";
import { flowRecurringPlanCreateSchema } from "@/lib/validations/flow-v3";

export const dynamic = "force-dynamic";

/** Crea una regla de egreso recurrente de plan y materializa sus celdas. */
export async function POST(request: NextRequest) {
  try {
    const guard = await requireFlowV3("cashflow_manage");
    if (guard.error) return guard.error;
    const parsed = flowRecurringPlanCreateSchema.safeParse(await request.json());
    if (!parsed.success) {
      const issues = parsed.error.issues.map((i) => i.message).join("; ");
      return NextResponse.json({ success: false, error: issues }, { status: 400 });
    }
    const { rowId, ...input } = parsed.data;
    const result = await createRecurrence(guard.ctx.tenantId, rowId, input, guard.ctx.userId);
    return NextResponse.json({
      success: true,
      data: { rule: toRecurrenceDto(result.rule), cells: result.cells },
    });
  } catch (error) {
    console.error("[Finance/FlowV3] POST recurring-plan:", error);
    return flowV3Error(error);
  }
}
