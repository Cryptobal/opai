import { NextRequest, NextResponse } from "next/server";
import { flowV3Error, requireFlowV3 } from "@/modules/finance/flow-v3/api-guard";
import {
  excludeIncomeDte,
  restoreIncomeDte,
} from "@/modules/finance/flow-v3/income-exclusion.service";

export const dynamic = "force-dynamic";

/**
 * POST — excluir un DTE del flujo de caja (razón obligatoria ≥ 5 chars).
 * DELETE — restaurar (quitar exclusión). Ledger DTE intacto.
 * Body: { dteId, reason? } / { dteId }.
 */
export async function POST(request: NextRequest) {
  try {
    const guard = await requireFlowV3("cashflow_manage");
    if (guard.error) return guard.error;
    const body = (await request.json()) as { dteId?: string; reason?: string };
    if (!body.dteId || typeof body.dteId !== "string") {
      return NextResponse.json({ success: false, error: "dteId requerido" }, { status: 400 });
    }
    await excludeIncomeDte({
      tenantId: guard.ctx.tenantId,
      userId: guard.ctx.userId,
      dteId: body.dteId,
      reason: body.reason ?? "",
    });
    return NextResponse.json({ success: true, data: { dteId: body.dteId, excluded: true } });
  } catch (error) {
    console.error("[Finance/FlowV3] POST income-exclusions:", error);
    return flowV3Error(error);
  }
}

export async function DELETE(request: NextRequest) {
  try {
    const guard = await requireFlowV3("cashflow_manage");
    if (guard.error) return guard.error;
    const body = (await request.json()) as { dteId?: string };
    if (!body.dteId || typeof body.dteId !== "string") {
      return NextResponse.json({ success: false, error: "dteId requerido" }, { status: 400 });
    }
    await restoreIncomeDte(guard.ctx.tenantId, body.dteId);
    return NextResponse.json({ success: true, data: { dteId: body.dteId, excluded: false } });
  } catch (error) {
    console.error("[Finance/FlowV3] DELETE income-exclusions:", error);
    return flowV3Error(error);
  }
}
