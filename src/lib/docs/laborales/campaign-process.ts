import { prisma } from "@/lib/prisma";
import { sendLaboralToGuardia } from "./send-laboral";

const BATCH = 15;
const STALE_MS = 2 * 60 * 1000;

export function campaignItemStatusFromError(message: string): "skipped" | "error" {
  return message.includes("sin contacto") || message.includes("en curso") ? "skipped" : "error";
}

export async function processLaboralCampaign(input: {
  tenantId: string;
  userId: string;
  campaignId: string;
}) {
  const campaign = await prisma.docBulkCampaign.findFirst({
    where: { id: input.campaignId, tenantId: input.tenantId },
  });
  if (!campaign) throw new Error("Campaña no encontrada");
  if (campaign.status === "cancelled") {
    return { processed: 0, remaining: 0, status: campaign.status };
  }

  const staleBefore = new Date(Date.now() - STALE_MS);
  await prisma.docBulkCampaignItem.updateMany({
    where: {
      campaignId: campaign.id,
      tenantId: input.tenantId,
      status: "processing",
      updatedAt: { lt: staleBefore },
    },
    data: { status: "pending" },
  });

  const claimed = await prisma.$transaction(async (tx) => {
    const items = await tx.docBulkCampaignItem.findMany({
      where: { campaignId: campaign.id, tenantId: input.tenantId, status: "pending" },
      take: BATCH,
      orderBy: { createdAt: "asc" },
    });
    if (items.length === 0) return [];
    await tx.docBulkCampaignItem.updateMany({
      where: { id: { in: items.map((i) => i.id) } },
      data: { status: "processing" },
    });
    return items;
  });

  let sent = 0;
  let error = 0;
  for (const item of claimed) {
    try {
      const result = await sendLaboralToGuardia({
        tenantId: input.tenantId,
        userId: input.userId,
        templateId: campaign.templateId,
        guardiaId: item.guardiaId,
      });
      await prisma.docBulkCampaignItem.update({
        where: { id: item.id },
        data: { status: "sent", documentId: result.documentId, error: null },
      });
      await prisma.docHistory.create({
        data: {
          documentId: result.documentId,
          action: "bulk_sent",
          details: { campaignId: campaign.id, guardiaId: item.guardiaId },
          createdBy: input.userId,
        },
      });
      sent += 1;
    } catch (err) {
      const message = err instanceof Error ? err.message : "Error";
      const skipped = campaignItemStatusFromError(message) === "skipped";
      await prisma.docBulkCampaignItem.update({
        where: { id: item.id },
        data: { status: skipped ? "skipped" : "error", error: message },
      });
      if (!skipped) error += 1;
    }
  }

  const remaining = await prisma.docBulkCampaignItem.count({
    where: { campaignId: campaign.id, status: { in: ["pending", "processing"] } },
  });
  const counts = await prisma.docBulkCampaignItem.groupBy({
    by: ["status"],
    where: { campaignId: campaign.id },
    _count: true,
  });
  const totals: Record<string, number> = { remaining };
  for (const row of counts) totals[row.status] = row._count;

  await prisma.docBulkCampaign.update({
    where: { id: campaign.id },
    data: {
      status: remaining === 0 ? "done" : "processing",
      totals,
    },
  });

  return { processed: claimed.length, remaining, sent, error, status: remaining === 0 ? "done" : "processing" };
}
