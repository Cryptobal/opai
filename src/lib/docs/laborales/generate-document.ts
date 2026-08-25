import { prisma } from "@/lib/prisma";
import { resolveDocument } from "@/lib/docs/token-resolver";
import { loadGuardiaPreviewEntities } from "./preview-entities";

export async function generateLaboralDocument(input: {
  tenantId: string;
  userId: string;
  templateId: string;
  guardiaId: string;
}) {
  const template = await prisma.docTemplate.findFirst({
    where: {
      id: input.templateId,
      tenantId: input.tenantId,
      module: "laboral",
      isActive: true,
    },
  });
  if (!template) throw new Error("Plantilla laboral no encontrada o inactiva");

  const guardia = await prisma.opsGuardia.findFirst({
    where: { id: input.guardiaId, tenantId: input.tenantId },
    include: { persona: true },
  });
  if (!guardia) throw new Error("Guardia no encontrado");
  if (guardia.status !== "active") throw new Error("guardia inactivo");

  const entities = await loadGuardiaPreviewEntities(input.tenantId, input.guardiaId);
  if (!entities) throw new Error("No se pudieron resolver los datos del guardia");

  const { resolvedContent, tokenValues } = resolveDocument(template.content, entities);
  const title = `${template.name} — ${guardia.persona.firstName} ${guardia.persona.lastName}`;

  const document = await prisma.document.create({
    data: {
      tenantId: input.tenantId,
      templateId: template.id,
      title,
      content: resolvedContent,
      tokenValues,
      module: "laboral",
      category: template.category,
      status: "draft",
      createdBy: input.userId,
    },
  });

  await prisma.docAssociation.create({
    data: {
      documentId: document.id,
      entityType: "ops_guardia",
      entityId: guardia.id,
      role: "primary",
    },
  });

  return document;
}
