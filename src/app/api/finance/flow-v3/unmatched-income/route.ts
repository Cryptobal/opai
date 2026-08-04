import { NextRequest, NextResponse } from "next/server";
import { requireFlowV3, flowV3Error } from "@/modules/finance/flow-v3/api-guard";
import {
  createRowFromUnmatchedDte,
  listUnmatchedIncomeForWeek,
} from "@/modules/finance/flow-v3/unmatched-income.service";
import { flowUnmatchedIncomeCreateSchema } from "@/lib/validations/flow-v3";

/** GET ?week=YYYY-MM-DD — DTEs de "Otros ingresos" esa semana. */
export async function GET(req: NextRequest) {
  const auth = await requireFlowV3("cashflow_view");
  if (auth.error) return auth.error;
  const week = req.nextUrl.searchParams.get("week");
  if (!week || !/^\d{4}-\d{2}-\d{2}$/.test(week)) {
    return NextResponse.json({ success: false, error: "week requerido (lunes YMD)" }, { status: 400 });
  }
  try {
    const data = await listUnmatchedIncomeForWeek(auth.ctx.tenantId, week);
    return NextResponse.json({ success: true, data });
  } catch (error) {
    console.error("[Finance/FlowV3] GET unmatched-income:", error);
    return flowV3Error(error);
  }
}

/** POST { dteId } — crea cuenta+fila genérica para rutar el DTE. */
export async function POST(req: NextRequest) {
  const auth = await requireFlowV3("cashflow_manage");
  if (auth.error) return auth.error;
  try {
    const body = flowUnmatchedIncomeCreateSchema.parse(await req.json());
    const data = await createRowFromUnmatchedDte(auth.ctx.tenantId, body.dteId);
    return NextResponse.json({ success: true, data });
  } catch (error) {
    console.error("[Finance/FlowV3] POST unmatched-income:", error);
    return flowV3Error(error);
  }
}
