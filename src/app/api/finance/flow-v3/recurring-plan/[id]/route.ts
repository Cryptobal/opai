import { NextRequest, NextResponse } from "next/server";
import { flowV3Error, requireFlowV3 } from "@/modules/finance/flow-v3/api-guard";
import {
  deleteRecurrence,
  toRecurrenceDto,
  updateRecurrence,
} from "@/modules/finance/flow-v3/recurring-plan.service";
import {
  flowRecurringPlanDeleteSchema,
  flowRecurringPlanUpdateSchema,
} from "@/lib/validations/flow-v3";

export const dynamic = "force-dynamic";

/** Edita una regla recurrente y reescribe SOLO sus celdas futuras. */
export async function PATCH(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> },
) {
  try {
    const guard = await requireFlowV3("cashflow_manage");
    if (guard.error) return guard.error;
    const { id } = await params;
    const parsed = flowRecurringPlanUpdateSchema.safeParse(await request.json());
    if (!parsed.success) {
      const issues = parsed.error.issues.map((i) => i.message).join("; ");
      return NextResponse.json({ success: false, error: issues }, { status: 400 });
    }
    const result = await updateRecurrence(guard.ctx.tenantId, id, parsed.data, guard.ctx.userId);
    return NextResponse.json({
      success: true,
      data: { rule: toRecurrenceDto(result.rule), cells: result.cells },
    });
  } catch (error) {
    console.error("[Finance/FlowV3] PATCH recurring-plan:", error);
    return flowV3Error(error);
  }
}

/** Elimina una regla recurrente. keepCells=false borra sus celdas futuras. */
export async function DELETE(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> },
) {
  try {
    const guard = await requireFlowV3("cashflow_manage");
    if (guard.error) return guard.error;
    const { id } = await params;
    const raw = await request.json().catch(() => ({}));
    const parsed = flowRecurringPlanDeleteSchema.safeParse(raw ?? {});
    const keepCells = parsed.success ? (parsed.data.keepCells ?? false) : false;
    const result = await deleteRecurrence(guard.ctx.tenantId, id, keepCells, guard.ctx.userId);
    return NextResponse.json({ success: true, data: result });
  } catch (error) {
    console.error("[Finance/FlowV3] DELETE recurring-plan:", error);
    return flowV3Error(error);
  }
}
