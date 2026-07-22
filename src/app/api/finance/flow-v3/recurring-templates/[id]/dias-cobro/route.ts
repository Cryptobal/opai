import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import { flowV3Error, requireFlowV3 } from "@/modules/finance/flow-v3/api-guard";
import { updateTemplateDiasCobro } from "@/modules/finance/flow-v3/recurring-end-date.service";

export const dynamic = "force-dynamic";

const schema = z.object({
  /** null = usar el default del tenant (collectionLagDays). */
  diasCobro: z.number().int().min(0).max(180).nullable(),
});

/** Término de pago POR CONTRATO: días entre emisión y cobro esperado. */
export async function PATCH(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> },
) {
  try {
    const guard = await requireFlowV3("cashflow_manage");
    if (guard.error) return guard.error;
    const { id } = await params;
    const parsed = schema.safeParse(await request.json());
    if (!parsed.success) {
      const issues = parsed.error.issues.map((i) => i.message).join("; ");
      return NextResponse.json({ success: false, error: issues }, { status: 400 });
    }
    const tpl = await updateTemplateDiasCobro(guard.ctx.tenantId, id, parsed.data.diasCobro);
    return NextResponse.json({
      success: true,
      data: { id: tpl.id, diasCobro: tpl.diasCobroDesdeFactura },
    });
  } catch (error) {
    console.error("[Finance/FlowV3] PATCH dias-cobro:", error);
    return flowV3Error(error);
  }
}
