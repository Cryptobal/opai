import { prisma } from "@/lib/prisma";
import { listEligibleGuardias } from "./campaign-eligible";

export async function createLaboralCampaign(input: {
  tenantId: string;
  userId: string;
  templateId: string;
  name?: string;
  audience: "all_active" | "installations" | "manual";
  installationIds?: string[];
  guardiaIds?: string[];
}) {
  const template = await prisma.docTemplate.findFirst({
    where: { id: input.templateId, tenantId: input.tenantId, module: "laboral" },
    select: { id: true, name: true },
  });
  if (!template) throw new Error("Plantilla no encontrada");

  const eligible = await listEligibleGuardias(input);
  const skipped = eligible.filter((g) => g.skipReason).length;
  const pending = eligible.length - skipped;

  const campaign = await prisma.docBulkCampaign.create({
    data: {
      tenantId: input.tenantId,
      templateId: template.id,
      name: input.name || `Envío ${template.name}`,
      status: "processing",
      createdBy: input.userId,
      totals: { total: eligible.length, pending, skipped, sent: 0, error: 0 },
      items: {
        create: eligible.map((g) => ({
          tenantId: input.tenantId,
          guardiaId: g.id,
          status: g.skipReason ? "skipped" : "pending",
          error: g.skipReason,
          snapshot: {
            name: g.name,
            installationId: g.installationId,
            installationName: g.installationName,
            email: g.email,
          },
        })),
      },
    },
  });

  return { campaignId: campaign.id, totals: { total: eligible.length, pending, skipped } };
}
