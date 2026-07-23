import { NextRequest, NextResponse } from "next/server";
import { flowV3Error, requireFlowV3 } from "@/modules/finance/flow-v3/api-guard";
import {
  persistV3WeeklyClose,
  reopenV3WeeklyClose,
} from "@/modules/finance/flow-v3/weekly-close.adapter";
import { flowWeeklyCloseSchema } from "@/lib/validations/flow-v3";

export const dynamic = "force-dynamic";

/** Cierra la semana v3. 409 si ya estaba cerrada; 400 si es futura o falta motivo. */
export async function POST(request: NextRequest) {
  try {
    const guard = await requireFlowV3("cashflow_manage");
    if (guard.error) return guard.error;
    const parsed = flowWeeklyCloseSchema.safeParse(await request.json());
    if (!parsed.success) {
      const issues = parsed.error.issues.map((i) => i.message).join("; ");
      return NextResponse.json({ success: false, error: issues }, { status: 400 });
    }
    const result = await persistV3WeeklyClose(guard.ctx.tenantId, guard.ctx.userId, {
      anyDayYmd: parsed.data.weekEnd,
      closedBalance: parsed.data.closedBalance,
      notes: parsed.data.notes,
      manualReason: parsed.data.manualReason,
    });
    return NextResponse.json({ success: true, data: result });
  } catch (error) {
    const message = error instanceof Error ? error.message : "";
    if (/ya está cerrada/i.test(message)) {
      return NextResponse.json({ success: false, error: message }, { status: 409 });
    }
    console.error("[Finance/FlowV3] POST weekly-close:", error);
    return flowV3Error(error);
  }
}

/** Reabre la semana v3 que contiene ?weekEnd=YYYY-MM-DD. */
export async function DELETE(request: NextRequest) {
  try {
    const guard = await requireFlowV3("cashflow_manage");
    if (guard.error) return guard.error;
    const weekEnd = new URL(request.url).searchParams.get("weekEnd");
    if (!weekEnd || !/^\d{4}-\d{2}-\d{2}$/.test(weekEnd)) {
      return NextResponse.json({ success: false, error: "weekEnd inválido" }, { status: 400 });
    }
    await reopenV3WeeklyClose(guard.ctx.tenantId, weekEnd);
    return NextResponse.json({ success: true, data: { reopened: true } });
  } catch (error) {
    console.error("[Finance/FlowV3] DELETE weekly-close:", error);
    return flowV3Error(error);
  }
}
