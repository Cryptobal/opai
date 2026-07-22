import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import { flowV3Error, requireFlowV3 } from "@/modules/finance/flow-v3/api-guard";
import { setPlanillaFlag } from "@/modules/finance/flow-v3/planilla-flag.service";

export const dynamic = "force-dynamic";

const schema = z.object({ enabled: z.boolean() });

/**
 * Activar/desactivar el Modo Planilla en la navegación del tenant, sin SQL.
 * Requiere cashflow_manage (owner/admin). Read-after-write.
 */
export async function POST(request: NextRequest) {
  try {
    const guard = await requireFlowV3("cashflow_manage");
    if (guard.error) return guard.error;
    const parsed = schema.safeParse(await request.json());
    if (!parsed.success) {
      return NextResponse.json({ success: false, error: "enabled requerido" }, { status: 400 });
    }
    const enabled = await setPlanillaFlag(guard.ctx.tenantId, parsed.data.enabled);
    return NextResponse.json({ success: true, data: { enabled } });
  } catch (error) {
    console.error("[Finance/FlowV3] POST flag:", error);
    return flowV3Error(error);
  }
}
