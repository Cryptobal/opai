import { NextRequest, NextResponse } from "next/server";
import { flowV3Error, requireFlowV3 } from "@/modules/finance/flow-v3/api-guard";
import { createRow, listRows } from "@/modules/finance/flow-v3/rows.service";
import { flowRowCreateSchema } from "@/lib/validations/flow-v3";

export const dynamic = "force-dynamic";

export async function GET() {
  try {
    const guard = await requireFlowV3("cashflow_view");
    if (guard.error) return guard.error;
    const rows = await listRows(guard.ctx.tenantId);
    return NextResponse.json({ success: true, data: rows });
  } catch (error) {
    console.error("[Finance/FlowV3] GET rows:", error);
    return flowV3Error(error);
  }
}

export async function POST(request: NextRequest) {
  try {
    const guard = await requireFlowV3("cashflow_manage");
    if (guard.error) return guard.error;
    const parsed = flowRowCreateSchema.safeParse(await request.json());
    if (!parsed.success) {
      const issues = parsed.error.issues.map((i) => i.message).join("; ");
      return NextResponse.json({ success: false, error: issues }, { status: 400 });
    }
    const row = await createRow(guard.ctx.tenantId, parsed.data);
    return NextResponse.json({ success: true, data: row });
  } catch (error) {
    console.error("[Finance/FlowV3] POST rows:", error);
    return flowV3Error(error);
  }
}
