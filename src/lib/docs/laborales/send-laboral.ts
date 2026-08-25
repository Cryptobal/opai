import { randomBytes } from "crypto";
import { prisma } from "@/lib/prisma";
import { generateLaboralDocument } from "./generate-document";
import { notifyDueSigners } from "./notify-due-signers";
import { ResolveSignersError, resolveLaboralSigners } from "./resolve-signers";
import { templateAppliesToGuardia } from "./scope";

export async function sendLaboralToGuardia(input: {
  tenantId: string;
  userId: string;
  templateId: string;
  guardiaId: string;
}) {
  const template = await prisma.docTemplate.findFirst({
    where: { id: input.templateId, tenantId: input.tenantId, module: "laboral" },
    include: { installations: true },
  });
  if (!template) throw new Error("Plantilla no encontrada");

  const guardia = await prisma.opsGuardia.findFirst({
    where: { id: input.guardiaId, tenantId: input.tenantId },
    include: { currentInstallation: { select: { isActive: true } } },
  });
  if (!guardia) throw new Error("Guardia no encontrado");
  if (guardia.status !== "active") throw new Error("guardia inactivo");

  const inScope = templateAppliesToGuardia({
    scopeType: template.scopeType,
    isActive: template.isActive,
    installationIds: template.installations.map((i) => i.installationId),
    currentInstallationId: guardia.currentInstallationId,
    installationIsActive: Boolean(guardia.currentInstallation?.isActive),
  });
  if (!inScope) throw new Error("La plantilla no aplica a la instalación del guardia");

  const activeDup = await prisma.document.findFirst({
    where: {
      tenantId: input.tenantId,
      templateId: template.id,
      signatureStatus: { in: ["pending", "in_progress"] },
      associations: { some: { entityType: "ops_guardia", entityId: input.guardiaId } },
    },
    select: { id: true },
  });
  if (activeDup) {
    throw new Error("Ya existe una solicitud de firma en curso para esta plantilla");
  }

  const { signingMode, recipients } = await resolveLaboralSigners(input);
  const document = await generateLaboralDocument(input);

  const created = await prisma.$transaction(async (tx) => {
    const request = await tx.docSignatureRequest.create({
      data: {
        tenantId: input.tenantId,
        documentId: document.id,
        status: "pending",
        signingMode,
        createdBy: input.userId,
      },
    });
    await tx.docSignatureRecipient.createMany({
      data: recipients.map((r) => ({
        requestId: request.id,
        token: randomBytes(24).toString("hex"),
        name: r.name,
        email: r.email,
        rut: r.rut,
        role: "signer",
        signingOrder: r.signingOrder,
        autoStamp: r.autoStamp,
        status: "pending",
      })),
    });
    await tx.document.update({
      where: { id: document.id },
      data: { signatureStatus: "pending" },
    });
    await tx.docHistory.create({
      data: {
        documentId: document.id,
        action: "signature_request_created",
        details: { recipients: recipients.map((r) => ({ email: r.email, role: r.role })) },
        createdBy: input.userId,
      },
    });
    return request;
  });

  await notifyDueSigners({
    requestId: created.id,
    tenantId: input.tenantId,
    documentTitle: document.title,
    createdBy: input.userId,
  });

  return { documentId: document.id, requestId: created.id };
}

export { ResolveSignersError };
