import { NextRequest, NextResponse } from "next/server";
import { parseBody, requireAuth, unauthorized } from "@/lib/api-auth";
import { requireLaboralesEdit, requireLaboralesView } from "@/lib/docs/laborales/perms";
import { createLaboralCampaignSchema } from "@/lib/validations/docs";
import { createLaboralCampaign } from "@/lib/docs/laborales/campaign-create";
import { listEligibleGuardias } from "@/lib/docs/laborales/campaign-eligible";
import { checkRateLimit } from "@/lib/rate-limit";
import { prisma } from "@/lib/prisma";

export async function GET() {
  const ctx = await requireAuth();
  if (!ctx) return unauthorized();
  const forbidden = await requireLaboralesView(ctx);
  if (forbidden) return forbidden;
  const campaigns = await prisma.docBulkCampaign.findMany({
    where: { tenantId: ctx.tenantId },
    include: { template: { select: { name: true } } },
    orderBy: { createdAt: "desc" },
    take: 50,
  });
  return NextResponse.json({ success: true, data: campaigns });
}

export async function POST(request: NextRequest) {
  try {
    const ctx = await requireAuth();
    if (!ctx) return unauthorized();
    const forbidden = await requireLaboralesEdit(ctx);
    if (forbidden) return forbidden;
    const rl = checkRateLimit(`laborales-campaigns:${ctx.tenantId}`, { limit: 10, windowSeconds: 60 });
    if (!rl.allowed) {
      return NextResponse.json({ success: false, error: "Demasiadas campañas" }, { status: 429 });
    }
    const parsed = await parseBody(request, createLaboralCampaignSchema);
    if (parsed.error) return parsed.error;
    const preview = request.nextUrl.searchParams.get("preview") === "1";
    if (preview) {
      const eligible = await listEligibleGuardias({ tenantId: ctx.tenantId, ...parsed.data });
      return NextResponse.json({ success: true, data: { eligible } });
    }
    const created = await createLaboralCampaign({
      tenantId: ctx.tenantId,
      userId: ctx.userId,
      ...parsed.data,
    });
    return NextResponse.json({ success: true, data: created }, { status: 201 });
  } catch (err) {
    const message = err instanceof Error ? err.message : "Error";
    return NextResponse.json({ success: false, error: message }, { status: 400 });
  }
}
