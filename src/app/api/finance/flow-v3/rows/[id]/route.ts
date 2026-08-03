import { NextRequest, NextResponse } from "next/server";
import { flowV3Error, requireFlowV3 } from "@/modules/finance/flow-v3/api-guard";
import { deleteRow, updateRow } from "@/modules/finance/flow-v3/rows.service";
import { flowRowUpdateSchema } from "@/lib/validations/flow-v3";

export const dynamic = "force-dynamic";

/** Edita nombre visible / sección / categoría (solo CATEGORY) de la fila. */
export async function PATCH(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> },
) {
  try {
    const guard = await requireFlowV3("cashflow_manage");
    if (guard.error) return guard.error;
    const { id } = await params;
    const parsed = flowRowUpdateSchema.safeParse(await request.json());
    if (!parsed.success) {
      const issues = parsed.error.issues.map((i) => i.message).join("; ");
      return NextResponse.json({ success: false, error: issues }, { status: 400 });
    }
    const row = await updateRow(guard.ctx.tenantId, id, parsed.data);
    return NextResponse.json({ success: true, data: row });
  } catch (error) {
    console.error("[Finance/FlowV3] PATCH row:", error);
    return flowV3Error(error);
  }
}

/** Elimina una fila SIN historial. 409 (con motivo) si tiene plan/comprometido/real. */
export async function DELETE(
  _request: NextRequest,
  { params }: { params: Promise<{ id: string }> },
) {
  try {
    const guard = await requireFlowV3("cashflow_manage");
    if (guard.error) return guard.error;
    const { id } = await params;
    const result = await deleteRow(guard.ctx.tenantId, id);
    return NextResponse.json({ success: true, data: result });
  } catch (error) {
    const message = error instanceof Error ? error.message : "";
    if (/archívala/i.test(message)) {
      return NextResponse.json({ success: false, error: message }, { status: 409 });
    }
    console.error("[Finance/FlowV3] DELETE row:", error);
    return flowV3Error(error);
  }
}
