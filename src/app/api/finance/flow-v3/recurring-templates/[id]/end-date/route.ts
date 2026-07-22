import { NextRequest, NextResponse } from "next/server";
import { flowV3Error, requireFlowV3 } from "@/modules/finance/flow-v3/api-guard";
import { updateTemplateEndDate } from "@/modules/finance/flow-v3/recurring-end-date.service";
import { flowRecurringEndDateSchema } from "@/lib/validations/flow-v3";

export const dynamic = "force-dynamic";

/**
 * Aplazar/fijar término de una programación desde la planilla.
 * Body { endDate: "YYYY-MM-DD" | null } (null = sin término).
 */
export async function PATCH(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> },
) {
  try {
    const guard = await requireFlowV3("cashflow_manage");
    if (guard.error) return guard.error;
    const { id } = await params;
    const parsed = flowRecurringEndDateSchema.safeParse(await request.json());
    if (!parsed.success) {
      const issues = parsed.error.issues.map((i) => i.message).join("; ");
      return NextResponse.json({ success: false, error: issues }, { status: 400 });
    }
    const template = await updateTemplateEndDate(guard.ctx.tenantId, id, parsed.data.endDate);
    return NextResponse.json({
      success: true,
      data: {
        id: template.id,
        endDate: template.endDate ? template.endDate.toISOString().slice(0, 10) : null,
        isActive: template.isActive,
        nextRunAt: template.nextRunAt ? template.nextRunAt.toISOString().slice(0, 10) : null,
      },
    });
  } catch (error) {
    console.error("[Finance/FlowV3] PATCH end-date:", error);
    return flowV3Error(error);
  }
}
