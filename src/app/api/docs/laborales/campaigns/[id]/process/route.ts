import { NextRequest, NextResponse } from "next/server";
import { requireAuth, unauthorized } from "@/lib/api-auth";
import { requireLaboralesEdit } from "@/lib/docs/laborales/perms";
import { processLaboralCampaign } from "@/lib/docs/laborales/campaign-process";
import { checkRateLimit } from "@/lib/rate-limit";

export async function POST(
  _request: NextRequest,
  { params }: { params: Promise<{ id: string }> },
) {
  try {
    const ctx = await requireAuth();
    if (!ctx) return unauthorized();
    const forbidden = await requireLaboralesEdit(ctx);
    if (forbidden) return forbidden;
    const rl = checkRateLimit(`laborales-process:${ctx.tenantId}`, { limit: 30, windowSeconds: 60 });
    if (!rl.allowed) {
      return NextResponse.json({ success: false, error: "Demasiados lotes" }, { status: 429 });
    }
    const { id } = await params;
    const result = await processLaboralCampaign({
      tenantId: ctx.tenantId,
      userId: ctx.userId,
      campaignId: id,
    });
    return NextResponse.json({ success: true, data: result });
  } catch (err) {
    const message = err instanceof Error ? err.message : "Error";
    return NextResponse.json({ success: false, error: message }, { status: 400 });
  }
}
