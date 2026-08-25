import { prisma } from "@/lib/prisma";
import { seedLaboralesTemplatesForTenant } from "@/lib/docs/seed-laborales-templates";
import type { ScopeType } from "@/lib/docs/laborales/constants";

export async function listLaboralTemplates(tenantId: string, createdBy: string) {
  await seedLaboralesTemplatesForTenant(tenantId, createdBy);
  return prisma.docTemplate.findMany({
    where: { tenantId, module: "laboral" },
    include: {
      signers: { orderBy: { signingOrder: "asc" } },
      installations: true,
      _count: { select: { documents: true } },
    },
    orderBy: { updatedAt: "desc" },
  });
}

export async function getScopeCounts(tenantId: string) {
  const [installations, guardias, signed] = await Promise.all([
    prisma.crmInstallation.count({ where: { tenantId, isActive: true } }),
    prisma.opsGuardia.count({
      where: { tenantId, status: "active", lifecycleStatus: "contratado" },
    }),
    prisma.document.count({
      where: { tenantId, module: "laboral", signatureStatus: "completed" },
    }),
  ]);
  return { installations, guardias, signed };
}

export async function listTenantInstallations(tenantId: string) {
  return prisma.crmInstallation.findMany({
    where: { tenantId, isActive: true },
    select: { id: true, name: true },
    orderBy: { name: "asc" },
    take: 500,
  });
}

export async function createLaboralTemplate(
  tenantId: string,
  createdBy: string,
  input: { name: string; description?: string; category: string; content?: unknown },
) {
  const created = await prisma.docTemplate.create({
    data: {
      tenantId,
      name: input.name,
      description: input.description ?? null,
      content: input.content ?? { type: "doc", content: [{ type: "paragraph" }] },
      module: "laboral",
      category: input.category,
      isActive: false,
      isDefault: false,
      scopeType: "none",
      signingMode: "sequential",
      createdBy,
    },
  });
  await prisma.docTemplateSigner.create({
    data: {
      tenantId,
      templateId: created.id,
      role: "trabajador",
      signingOrder: 1,
      autoStamp: false,
    },
  });
  return created;
}

export async function updateLaboralScope(
  tenantId: string,
  templateId: string,
  input: { scopeType: ScopeType; installationIds?: string[]; signingMode?: string; isActive?: boolean },
) {
  const template = await prisma.docTemplate.findFirst({
    where: { id: templateId, tenantId, module: "laboral" },
  });
  if (!template) throw new Error("Plantilla no encontrada");

  const ids = input.installationIds ?? [];
  if (input.scopeType === "installations" && ids.length === 0 && input.isActive) {
    throw new Error("Selecciona al menos una instalación para publicar");
  }
  if (ids.length > 0) {
    const found = await prisma.crmInstallation.findMany({
      where: { tenantId, id: { in: ids } },
      select: { id: true },
    });
    if (found.length !== ids.length) {
      throw new Error("Hay instalaciones que no pertenecen a esta empresa");
    }
  }

  const isActive =
    input.scopeType === "installations" && ids.length === 0
      ? false
      : (input.isActive ?? template.isActive);

  await prisma.$transaction(async (tx) => {
    await tx.docTemplate.update({
      where: { id: templateId },
      data: {
        scopeType: input.scopeType,
        ...(input.signingMode ? { signingMode: input.signingMode } : {}),
        isActive,
      },
    });
    await tx.docTemplateInstallation.deleteMany({ where: { templateId, tenantId } });
    if (input.scopeType === "installations" && ids.length > 0) {
      await tx.docTemplateInstallation.createMany({
        data: ids.map((installationId) => ({ tenantId, templateId, installationId })),
      });
    }
  });
  return prisma.docTemplate.findFirst({
    where: { id: templateId, tenantId },
    include: { signers: { orderBy: { signingOrder: "asc" } }, installations: true },
  });
}
