import { prisma } from "@/lib/prisma";
import type { TemplateSignerRole } from "@/lib/docs/laborales/constants";

export async function replaceTemplateSigners(
  tenantId: string,
  templateId: string,
  signers: Array<{
    role: TemplateSignerRole;
    signerRefId?: string | null;
    name?: string | null;
    email?: string | null;
    signingOrder: number;
    autoStamp?: boolean;
  }>,
) {
  const template = await prisma.docTemplate.findFirst({
    where: { id: templateId, tenantId, module: "laboral" },
    select: { id: true },
  });
  if (!template) throw new Error("Plantilla no encontrada");

  const sorted = [...signers].sort((a, b) => a.signingOrder - b.signingOrder);
  if (sorted[0]?.role !== "trabajador") {
    throw new Error("El primer firmante debe ser el trabajador");
  }
  if (sorted[0].autoStamp) {
    throw new Error("El trabajador no puede auto-estamparse");
  }

  await prisma.$transaction(async (tx) => {
    await tx.docTemplateSigner.deleteMany({ where: { templateId, tenantId } });
    await tx.docTemplateSigner.createMany({
      data: sorted.map((s, idx) => ({
        tenantId,
        templateId,
        role: s.role,
        signerRefId: s.signerRefId ?? null,
        name: s.name ?? null,
        email: s.email?.toLowerCase() ?? null,
        signingOrder: idx + 1,
        autoStamp: s.role === "trabajador" ? false : Boolean(s.autoStamp),
      })),
    });
  });

  return prisma.docTemplateSigner.findMany({
    where: { templateId, tenantId },
    orderBy: { signingOrder: "asc" },
  });
}
