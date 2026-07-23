import { NextRequest, NextResponse } from "next/server";
import { flowV3Error, requireFlowV3 } from "@/modules/finance/flow-v3/api-guard";
import { unarchiveRow } from "@/modules/finance/flow-v3/rows.service";

export const dynamic = "force-dynamic";

/** Desarchiva una fila (vuelve a admitir plan y a proyectarse). */
export async function POST(
  _request: NextRequest,
  { params }: { params: Promise<{ id: string }> },
) {
  try {
    const guard = await requireFlowV3("cashflow_manage");
    if (guard.error) return guard.error;
    const { id } = await params;
    const row = await unarchiveRow(guard.ctx.tenantId, id);
    return NextResponse.json({ success: true, data: row });
  } catch (error) {
    console.error("[Finance/FlowV3] POST unarchive:", error);
    return flowV3Error(error);
  }
}
