import { NextRequest, NextResponse } from "next/server";
import { flowV3Error, requireFlowV3 } from "@/modules/finance/flow-v3/api-guard";
import { archiveRow } from "@/modules/finance/flow-v3/rows.service";

export const dynamic = "force-dynamic";

/**
 * Archiva una fila (nunca borra plan histórico). Si la cuenta/instalación
 * tiene programación activa, la respuesta trae el warning para que la UI
 * ofrezca "desactivar programación también".
 */
export async function POST(
  _request: NextRequest,
  { params }: { params: Promise<{ id: string }> },
) {
  try {
    const guard = await requireFlowV3("cashflow_manage");
    if (guard.error) return guard.error;
    const { id } = await params;
    const result = await archiveRow(guard.ctx.tenantId, id);
    return NextResponse.json({ success: true, data: result });
  } catch (error) {
    console.error("[Finance/FlowV3] POST archive:", error);
    return flowV3Error(error);
  }
}
