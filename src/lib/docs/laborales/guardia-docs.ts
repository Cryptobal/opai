import { prisma } from "@/lib/prisma";
import { templateAppliesToGuardia } from "./scope";

export async function listLaboralTemplatesForGuardia(tenantId: string, guardiaId: string) {
  const guardia = await prisma.opsGuardia.findFirst({
    where: { id: guardiaId, tenantId },
    include: { currentInstallation: { select: { isActive: true } } },
  });
  if (!guardia) return [];

  const templates = await prisma.docTemplate.findMany({
    where: { tenantId, module: "laboral", isActive: true },
    include: {
      signers: { orderBy: { signingOrder: "asc" } },
      installations: true,
    },
    orderBy: { name: "asc" },
  });

  return templates.filter((t) =>
    templateAppliesToGuardia({
      scopeType: t.scopeType,
      isActive: t.isActive,
      installationIds: t.installations.map((i) => i.installationId),
      currentInstallationId: guardia.currentInstallationId,
      installationIsActive: Boolean(guardia.currentInstallation?.isActive),
    }),
  );
}

export async function listLaboralDocumentsForGuardia(tenantId: string, guardiaId: string) {
  return prisma.document.findMany({
    where: {
      tenantId,
      module: "laboral",
      associations: { some: { entityType: "ops_guardia", entityId: guardiaId } },
    },
    include: {
      signatureRequests: {
        orderBy: { createdAt: "desc" },
        take: 1,
        include: {
          recipients: { orderBy: { signingOrder: "asc" } },
        },
      },
    },
    orderBy: { createdAt: "desc" },
    take: 50,
  });
}
