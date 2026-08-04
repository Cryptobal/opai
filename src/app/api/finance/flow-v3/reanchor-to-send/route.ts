import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import { flowV3Error, requireFlowV3 } from "@/modules/finance/flow-v3/api-guard";
import {
  listFutureDatedIssued,
  reanchorIssuedToSendWeek,
} from "@/modules/finance/flow-v3/reanchor-to-send.service";

export const dynamic = "force-dynamic";

/** GET — candidatos a reanclar (fecha doc > hoy). */
export async function GET() {
  try {
    const guard = await requireFlowV3("cashflow_manage");
    if (guard.error) return guard.error;
    const data = await listFutureDatedIssued(guard.ctx.tenantId);
    return NextResponse.json({ success: true, data });
  } catch (error) {
    console.error("[Finance/FlowV3] GET reanchor-to-send:", error);
    return flowV3Error(error);
  }
}

const postSchema = z.object({
  dteIds: z.array(z.string().uuid()).min(1).max(200),
});

/** POST — crea overrides a semana de envío real (sin tocar el DTE). */
export async function POST(request: NextRequest) {
  try {
    const guard = await requireFlowV3("cashflow_manage");
    if (guard.error) return guard.error;
    const body = await request.json();
    const parsed = postSchema.safeParse(body);
    if (!parsed.success) {
      return NextResponse.json(
        { success: false, error: "dteIds inválidos" },
        { status: 400 },
      );
    }
    const result = await reanchorIssuedToSendWeek({
      tenantId: guard.ctx.tenantId,
      userId: guard.ctx.userId,
      dteIds: parsed.data.dteIds,
    });
    return NextResponse.json({ success: true, data: result });
  } catch (error) {
    console.error("[Finance/FlowV3] POST reanchor-to-send:", error);
    return flowV3Error(error);
  }
}
