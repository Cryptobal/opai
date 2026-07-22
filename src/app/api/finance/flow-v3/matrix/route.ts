import { NextRequest, NextResponse } from "next/server";
import { requireFlowV3 } from "@/modules/finance/flow-v3/api-guard";
import { buildFlowMatrix } from "@/modules/finance/flow-v3/matrix.service";
import { flowMatrixQuerySchema } from "@/lib/validations/flow-v3";

// Estado vivo derivado de DTEs/banco/programaciones: nunca cachear.
export const dynamic = "force-dynamic";

export async function GET(request: NextRequest) {
  try {
    const guard = await requireFlowV3("cashflow_view");
    if (guard.error) return guard.error;

    const url = new URL(request.url);
    const parsed = flowMatrixQuerySchema.safeParse({
      from: url.searchParams.get("from") ?? undefined,
      to: url.searchParams.get("to") ?? undefined,
      horizon: url.searchParams.get("horizon") ?? undefined,
    });
    if (!parsed.success) {
      const issues = parsed.error.issues.map((i) => `${i.path.join(".")}: ${i.message}`).join("; ");
      return NextResponse.json({ success: false, error: issues }, { status: 400 });
    }

    const data = await buildFlowMatrix(guard.ctx.tenantId, {
      from: parsed.data.from,
      to: parsed.data.to,
      granularity: parsed.data.horizon,
      // Solo un usuario con permiso de gestión dispara el auto-bootstrap
      // (crear filas/backfill). Los de solo-lectura ven la planilla tal cual
      // esté; nunca provocan escrituras desde este GET.
      allowBootstrap: guard.canManage,
    });
    return NextResponse.json({ success: true, data });
  } catch (error) {
    console.error("[Finance/FlowV3] GET matrix:", error);
    return NextResponse.json({ success: false, error: "Error interno" }, { status: 500 });
  }
}
