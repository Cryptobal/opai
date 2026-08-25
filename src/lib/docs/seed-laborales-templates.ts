import { prisma } from "@/lib/prisma";
import { dasContent, eppContent, odiContent } from "./seed-laborales-content";

const SEEDS = [
  { name: "ODI — Obligación de Informar", category: "odi", content: odiContent },
  { name: "Derecho a Saber (D.S. 40)", category: "das", content: dasContent },
  { name: "Entrega de EPP", category: "epp", content: eppContent },
] as const;

export async function seedLaboralesTemplatesForTenant(tenantId: string, createdBy: string) {
  for (const seed of SEEDS) {
    const existing = await prisma.docTemplate.findFirst({
      where: { tenantId, module: "laboral", name: seed.name },
      select: { id: true },
    });
    if (existing) continue;
    const created = await prisma.docTemplate.create({
      data: {
        tenantId,
        name: seed.name,
        description: "Plantilla laboral predefinida (editable)",
        content: seed.content(),
        module: "laboral",
        category: seed.category,
        isActive: true,
        isDefault: true,
        scopeType: "global_active",
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
  }
}
