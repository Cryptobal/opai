import { NextRequest, NextResponse } from "next/server";
import { flowV3Error, requireFlowV3 } from "@/modules/finance/flow-v3/api-guard";
import { renameRow } from "@/modules/finance/flow-v3/rows.service";
import { flowRowRenameSchema } from "@/lib/validations/flow-v3";

export const dynamic = "force-dynamic";

export async function PATCH(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> },
) {
  try {
    const guard = await requireFlowV3("cashflow_manage");
    if (guard.error) return guard.error;
    const { id } = await params;
    const parsed = flowRowRenameSchema.safeParse(await request.json());
    if (!parsed.success) {
      const issues = parsed.error.issues.map((i) => i.message).join("; ");
      return NextResponse.json({ success: false, error: issues }, { status: 400 });
    }
    const row = await renameRow(guard.ctx.tenantId, id, parsed.data.name);
    return NextResponse.json({ success: true, data: row });
  } catch (error) {
    console.error("[Finance/FlowV3] PATCH row:", error);
    return flowV3Error(error);
  }
}
