import type { Prisma } from "@prisma/client";
import { prisma } from "@/lib/prisma";

export async function listCampaignTracking(input: {
  tenantId: string;
  campaignId?: string;
  status?: string;
  installationId?: string;
  page?: number;
}) {
  const page = Math.max(1, input.page ?? 1);
  const take = 40;
  const where: Prisma.DocBulkCampaignItemWhereInput = {
    tenantId: input.tenantId,
    ...(input.campaignId ? { campaignId: input.campaignId } : {}),
    ...(input.status ? { status: input.status } : {}),
    ...(input.installationId
      ? { snapshot: { path: ["installationId"], equals: input.installationId } }
      : {}),
  };

  const [campaigns, items, total, installations] = await Promise.all([
    prisma.docBulkCampaign.findMany({
      where: { tenantId: input.tenantId },
      include: { template: { select: { name: true } } },
      orderBy: { createdAt: "desc" },
      take: 30,
    }),
    prisma.docBulkCampaignItem.findMany({
      where,
      orderBy: { updatedAt: "desc" },
      skip: (page - 1) * take,
      take,
    }),
    prisma.docBulkCampaignItem.count({ where }),
    prisma.crmInstallation.findMany({
      where: { tenantId: input.tenantId, isActive: true },
      select: { id: true, name: true },
      orderBy: { name: "asc" },
      take: 200,
    }),
  ]);

  const documentIds = items.map((i) => i.documentId).filter((id): id is string => Boolean(id));
  const requests = documentIds.length
    ? await prisma.docSignatureRequest.findMany({
        where: { tenantId: input.tenantId, documentId: { in: documentIds } },
        include: {
          document: { select: { title: true } },
          recipients: {
            orderBy: { signingOrder: "asc" },
            select: {
              id: true,
              name: true,
              status: true,
              declineReason: true,
              signingOrder: true,
              signatureMethod: true,
            },
          },
        },
        orderBy: { createdAt: "desc" },
      })
    : [];
  const byDoc = new Map<string, (typeof requests)[number]>();
  for (const req of requests) {
    if (!byDoc.has(req.documentId)) byDoc.set(req.documentId, req);
  }

  return {
    campaigns: campaigns.map((c) => ({
      id: c.id,
      name: c.name,
      status: c.status,
      totals: c.totals,
      templateName: c.template.name,
    })),
    installations,
    total,
    page,
    items: items.map((item) => {
      const req = item.documentId ? byDoc.get(item.documentId) : undefined;
      return {
        id: item.id,
        campaignId: item.campaignId,
        guardiaId: item.guardiaId,
        status: item.status,
        error: item.error,
        documentId: item.documentId,
        snapshot: item.snapshot,
        updatedAt: item.updatedAt,
        documentTitle: req?.document.title ?? null,
        signingMode: req?.signingMode ?? "sequential",
        recipients: req?.recipients ?? [],
      };
    }),
  };
}
