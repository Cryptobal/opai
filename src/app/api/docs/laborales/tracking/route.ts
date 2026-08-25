import { NextRequest, NextResponse } from "next/server";
import { requireAuth, unauthorized } from "@/lib/api-auth";
import { requireLaboralesView } from "@/lib/docs/laborales/perms";
import { listCampaignTracking } from "@/lib/docs/laborales/tracking";

export async function GET(request: NextRequest) {
  const ctx = await requireAuth();
  if (!ctx) return unauthorized();
  const forbidden = await requireLaboralesView(ctx);
  if (forbidden) return forbidden;
  const { searchParams } = request.nextUrl;
  const data = await listCampaignTracking({
    tenantId: ctx.tenantId,
    campaignId: searchParams.get("campaignId") || undefined,
    status: searchParams.get("status") || undefined,
    installationId: searchParams.get("installationId") || undefined,
    page: Number(searchParams.get("page") ?? 1),
  });
  return NextResponse.json({ success: true, data });
}
