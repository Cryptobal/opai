import { Prisma } from "@prisma/client";
import { prisma } from "@/lib/prisma";
import { STORAGE_PROVIDER } from "@/lib/storage";
import { enqueueCrmFileToDrive } from "@/lib/google-workspace/drive-enqueue-hooks";
import type { LeadExtraction, StagedFile, CreateLeadMode } from "./email-to-lead.types";

function splitName(nombre: string | null): { firstName: string | null; lastName: string | null } {
  if (!nombre) return { firstName: null, lastName: null };
  const parts = nombre.trim().split(/\s+/);
  return parts.length === 1
    ? { firstName: parts[0], lastName: null }
    : { firstName: parts[0], lastName: parts.slice(1).join(" ") };
}

async function attach(
  tenantId: string,
  userId: string,
  file: StagedFile,
  entityType: "lead" | "deal",
  entityId: string,
) {
  const crmFile = await prisma.crmFile.create({
    data: {
      tenantId, fileName: file.fileName, mimeType: file.mimeType, size: file.size,
      storageProvider: STORAGE_PROVIDER, storageKey: file.storageKey, createdBy: userId,
    },
  });
  await prisma.crmFileLink.create({ data: { tenantId, fileId: crmFile.id, entityType, entityId } });
  void enqueueCrmFileToDrive({
    tenantId, entityType, entityId,
    file: { id: crmFile.id, storageKey: file.storageKey, fileName: file.fileName, mimeType: file.mimeType },
  });
}

export type CreateLeadResult = {
  ok: boolean;
  leadId?: string;
  leadUrl?: string;
  dealId?: string;
  contactId?: string;
  note?: string;
  error?: string;
};

/** Crea el lead (+ contacto/negocio opcional) desde la propuesta editada. */
export async function createLeadFromExtraction(params: {
  tenantId: string;
  userId: string;
  emailAccountId: string;
  threadId: string;
  proposal: LeadExtraction;
  mode: CreateLeadMode;
  stagedFiles: StagedFile[];
}): Promise<CreateLeadResult> {
  const { tenantId, userId, emailAccountId, threadId, proposal, mode } = params;
  const thread = await prisma.crmEmailThread.findFirst({
    where: { id: threadId, tenantId, emailAccountId },
    select: { id: true, accountId: true, contactId: true },
  });
  if (!thread) return { ok: false, error: "Hilo no encontrado" };

  const files = params.stagedFiles.filter(
    (f) => f.storageKey.startsWith(`${tenantId}/`) && f.storageKey.includes("chat-staged"),
  );
  const { firstName, lastName } = splitName(proposal.contacto.nombre);
  const notes = [
    proposal.requerimiento,
    proposal.rut ? `RUT: ${proposal.rut}` : null,
    proposal.dotacionEstimada ? `Dotación estimada: ${proposal.dotacionEstimada}` : null,
    proposal.esLicitacion ? "Marcado como licitación." : null,
  ].filter(Boolean).join(" · ");

  const lead = await prisma.crmLead.create({
    data: {
      tenantId, status: "pending", source: "correo_ia",
      companyName: proposal.empresa, firstName, lastName,
      email: proposal.contacto.email, phone: proposal.contacto.telefono,
      commune: proposal.instalacionComuna, notes: notes || null,
      metadata: { origen: "correo_ia", threadId, extraction: proposal } as Prisma.InputJsonValue,
    },
  });
  for (const f of files) await attach(tenantId, userId, f, "lead", lead.id);

  let contactId = thread.contactId;
  if (thread.accountId && proposal.contacto.email && !contactId) {
    const existing = await prisma.crmContact.findFirst({
      where: { tenantId, accountId: thread.accountId, email: { equals: proposal.contacto.email, mode: "insensitive" } },
      select: { id: true },
    });
    contactId = existing?.id ?? (
      await prisma.crmContact.create({
        data: {
          tenantId, accountId: thread.accountId,
          firstName: firstName ?? "Contacto", lastName: lastName ?? "",
          email: proposal.contacto.email, phone: proposal.contacto.telefono, roleTitle: proposal.contacto.cargo,
        },
      })
    ).id;
  }

  let dealId: string | undefined;
  let note: string | undefined;
  if (mode === "lead_y_negocio" && proposal.esLicitacion) {
    const stage = thread.accountId
      ? await prisma.crmPipelineStage.findFirst({ where: { tenantId, isActive: true }, orderBy: { order: "asc" }, select: { id: true } })
      : null;
    if (thread.accountId && stage) {
      const deal = await prisma.crmDeal.create({
        data: {
          tenantId, accountId: thread.accountId, stageId: stage.id,
          title: proposal.empresa ? `Licitación ${proposal.empresa}` : "Licitación",
          amount: 0, isLicitacion: true, primaryContactId: contactId,
          fechaEntrega: proposal.fechaLimite ? new Date(`${proposal.fechaLimite}T12:00:00Z`) : null,
        },
      });
      dealId = deal.id;
      for (const f of files) await attach(tenantId, userId, f, "deal", deal.id);
      const { syncLicitacionToCalendar } = await import("@/modules/agenda/agenda-sync");
      await syncLicitacionToCalendar(tenantId, deal.id).catch((e) => console.error("[email-to-lead] sync licitación:", e));
    } else {
      note = "Asociá el hilo a una cuenta para crear el negocio de licitación.";
    }
  }

  await prisma.crmEmailThread.update({
    where: { id: thread.id },
    data: { leadId: lead.id, ...(contactId ? { contactId } : {}) },
  });

  // Verdad Verificada: read-after-write.
  const check = await prisma.crmLead.findFirst({ where: { id: lead.id, tenantId }, select: { id: true } });
  if (!check) return { ok: false, error: "No se pudo confirmar la creación del lead." };

  return { ok: true, leadId: lead.id, leadUrl: `/crm/leads/${lead.id}`, dealId, contactId: contactId ?? undefined, note };
}
