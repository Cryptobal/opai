import { NextRequest, NextResponse } from "next/server";
import { requireAuth, unauthorized } from "@/lib/api-auth";
import { requireLaboralesView } from "@/lib/docs/laborales/perms";
import { prisma } from "@/lib/prisma";

export async function GET(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> },
) {
  const ctx = await requireAuth();
  if (!ctx) return unauthorized();
  const forbidden = await requireLaboralesView(ctx);
  if (forbidden) return forbidden;
  const { id } = await params;
  const campaign = await prisma.docBulkCampaign.findFirst({
    where: { id, tenantId: ctx.tenantId },
    include: { template: { select: { name: true } } },
  });
  if (!campaign) {
    return NextResponse.json({ success: false, error: "Campaña no encontrada" }, { status: 404 });
  }
  const page = Math.max(1, Number(request.nextUrl.searchParams.get("page") ?? 1));
  const take = 50;
  const [items, total] = await Promise.all([
    prisma.docBulkCampaignItem.findMany({
      where: { campaignId: id, tenantId: ctx.tenantId },
      orderBy: { createdAt: "asc" },
      skip: (page - 1) * take,
      take,
    }),
    prisma.docBulkCampaignItem.count({ where: { campaignId: id, tenantId: ctx.tenantId } }),
  ]);
  return NextResponse.json({ success: true, data: { campaign, items, total, page } });
}
