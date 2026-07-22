import { NextRequest, NextResponse } from "next/server";
import { flowV3Error, requireFlowV3 } from "@/modules/finance/flow-v3/api-guard";
import { reorderRows } from "@/modules/finance/flow-v3/rows.service";
import { flowRowReorderSchema } from "@/lib/validations/flow-v3";

export const dynamic = "force-dynamic";

export async function POST(request: NextRequest) {
  try {
    const guard = await requireFlowV3("cashflow_manage");
    if (guard.error) return guard.error;
    const parsed = flowRowReorderSchema.safeParse(await request.json());
    if (!parsed.success) {
      const issues = parsed.error.issues.map((i) => i.message).join("; ");
      return NextResponse.json({ success: false, error: issues }, { status: 400 });
    }
    await reorderRows(guard.ctx.tenantId, parsed.data.section, parsed.data.orderedIds);
    return NextResponse.json({ success: true });
  } catch (error) {
    console.error("[Finance/FlowV3] POST reorder:", error);
    return flowV3Error(error);
  }
}
