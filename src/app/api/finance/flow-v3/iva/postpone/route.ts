import { NextRequest, NextResponse } from "next/server";
import { flowV3Error, requireFlowV3 } from "@/modules/finance/flow-v3/api-guard";
import {
  postponeIva,
  undoIvaPostponement,
} from "@/modules/finance/flow-v3/iva-postponement.service";
import { flowIvaPostponeSchema } from "@/lib/validations/flow-v3";

export const dynamic = "force-dynamic";

/** Posterga el IVA determinado de un período tributario (2 meses). */
export async function POST(request: NextRequest) {
  try {
    const guard = await requireFlowV3("cashflow_manage");
    if (guard.error) return guard.error;
    const parsed = flowIvaPostponeSchema.safeParse(await request.json());
    if (!parsed.success) {
      const issues = parsed.error.issues.map((i) => i.message).join("; ");
      return NextResponse.json({ success: false, error: issues }, { status: 400 });
    }
    const result = await postponeIva({
      tenantId: guard.ctx.tenantId,
      taxPeriod: parsed.data.taxPeriod,
      createdBy: guard.ctx.userId,
    });
    return NextResponse.json({ success: true, data: result });
  } catch (error) {
    console.error("[Finance/FlowV3] POST iva/postpone:", error);
    return flowV3Error(error);
  }
}

/** Deshace la postergación y borra el override de semana del hito. */
export async function DELETE(request: NextRequest) {
  try {
    const guard = await requireFlowV3("cashflow_manage");
    if (guard.error) return guard.error;
    const parsed = flowIvaPostponeSchema.safeParse(await request.json());
    if (!parsed.success) {
      const issues = parsed.error.issues.map((i) => i.message).join("; ");
      return NextResponse.json({ success: false, error: issues }, { status: 400 });
    }
    const result = await undoIvaPostponement({
      tenantId: guard.ctx.tenantId,
      taxPeriod: parsed.data.taxPeriod,
      userId: guard.ctx.userId,
    });
    return NextResponse.json({ success: true, data: result });
  } catch (error) {
    console.error("[Finance/FlowV3] DELETE iva/postpone:", error);
    return flowV3Error(error);
  }
}
