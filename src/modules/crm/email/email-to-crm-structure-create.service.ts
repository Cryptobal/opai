import { Prisma } from "@prisma/client";
import { prisma } from "@/lib/prisma";
import { STORAGE_PROVIDER } from "@/lib/storage";
import { enqueueCrmFileToDrive } from "@/lib/google-workspace/drive-enqueue-hooks";
import type { StagedFile } from "./email-to-lead.types";
import type { CreateCrmStructureResult, CrmStructureProposal } from "./email-to-crm-structure.types";
import { coerceCrmStructureProposal } from "./email-to-crm-structure.service";

async function attach(
  tenantId: string,
  userId: string,
  file: StagedFile,
  entityType: "deal" | "account",
  entityId: string,
) {
  const crmFile = await prisma.crmFile.create({
    data: {
      tenantId,
      fileName: file.fileName,
      mimeType: file.mimeType,
      size: file.size,
      storageProvider: STORAGE_PROVIDER,
      storageKey: file.storageKey,
      createdBy: userId,
    },
  });
  await prisma.crmFileLink.create({
    data: { tenantId, fileId: crmFile.id, entityType, entityId },
  });
  void enqueueCrmFileToDrive({
    tenantId,
    entityType,
    entityId,
    file: {
      id: crmFile.id,
      storageKey: file.storageKey,
      fileName: file.fileName,
      mimeType: file.mimeType,
    },
  });
}

function buildDealNotes(proposal: CrmStructureProposal): string {
  const lines: string[] = [];
  if (proposal.requerimiento) lines.push(proposal.requerimiento);
  if (proposal.coverageIsRequirementNotStaffing) {
    lines.push(
      "Documento define COBERTURA (no dotación). Dotación propuesta Gard calculada a " +
        `${proposal.weeklyHoursPerWorker} h/sem.`,
    );
  }
  const t = proposal.staffingTotals;
  lines.push(
    `Dotación propuesta: ${t.headcountBase} base` +
      (t.reserveHeadcount ? ` + ${t.reserveHeadcount} reserva (~10%) = ${t.headcountWithReserve}` : "") +
      ` · HH/sem ${t.weeklyHH} · mínimo legal ceil(HH/${proposal.weeklyHoursPerWorker})=${t.legalMinimum}`,
  );
  for (const inst of proposal.installations) {
    const slots = inst.coverageSlots
      .map(
        (s) =>
          `  - ${s.name}: cobertura ${s.simultaneous} → dotación ${s.headcount} (${s.pattern}) ${s.horaInicio}-${s.horaFin}`,
      )
      .join("\n");
    lines.push(`Instalación ${inst.name}:\n${slots || "  (sin slots)"}`);
  }
  if (proposal.assumptions.length) {
    lines.push("Supuestos: " + proposal.assumptions.join(" · "));
  }
  if (proposal.openQuestions.length) {
    lines.push("Pendientes: " + proposal.openQuestions.join(" · "));
  }
  return lines.join("\n\n").slice(0, 8000);
}

function installationMetadata(proposal: CrmStructureProposal, instName: string) {
  const inst = proposal.installations.find((i) => i.name === instName);
  if (!inst) return null;
  return {
    origen: "correo_ia_crm_structure",
    coverageIsRequirementNotStaffing: proposal.coverageIsRequirementNotStaffing,
    weeklyHoursPerWorker: proposal.weeklyHoursPerWorker,
    coverageSlots: inst.coverageSlots,
    staffingSubtotal: {
      weeklyHH: inst.coverageSlots.reduce((a, s) => a + s.weeklyHH, 0),
      headcount: inst.coverageSlots.reduce((a, s) => a + s.headcount, 0),
    },
  };
}

/** Crea cuenta + contacto + deal + N instalaciones desde la propuesta confirmada. */
export async function createCrmStructureFromProposal(params: {
  tenantId: string;
  userId: string;
  emailAccountId: string;
  threadId: string;
  proposal: CrmStructureProposal;
  stagedFiles: StagedFile[];
}): Promise<CreateCrmStructureResult> {
  const { tenantId, userId, emailAccountId, threadId } = params;
  const proposal = coerceCrmStructureProposal(params.proposal);

  if (!proposal.account.name?.trim()) {
    return { ok: false, error: "La propuesta no tiene nombre de cuenta." };
  }
  if (proposal.installations.length === 0) {
    return { ok: false, error: "La propuesta no tiene instalaciones. Revisá el adjunto o pedí re-extraer." };
  }

  const thread = await prisma.crmEmailThread.findFirst({
    where: { id: threadId, tenantId, emailAccountId },
    select: { id: true, accountId: true, contactId: true, dealId: true },
  });
  if (!thread) return { ok: false, error: "Hilo no encontrado" };

  const files = params.stagedFiles.filter(
    (f) => f.storageKey.startsWith(`${tenantId}/`) && f.storageKey.includes("chat-staged"),
  );

  const stage = await prisma.crmPipelineStage.findFirst({
    where: { tenantId, isActive: true },
    orderBy: { order: "asc" },
    select: { id: true },
  });
  if (!stage) {
    return { ok: false, error: "No hay etapas de pipeline configuradas." };
  }

  const accountName = proposal.account.name.trim();

  // Reutilizar cuenta existente por nombre exacto (case-insensitive) en el tenant.
  let account = await prisma.crmAccount.findFirst({
    where: { tenantId, name: { equals: accountName, mode: "insensitive" } },
    select: { id: true, name: true },
  });
  let accountReused = !!account;
  if (!account) {
    account = await prisma.crmAccount.create({
      data: {
        tenantId,
        name: accountName,
        type: "prospect",
        rut: proposal.account.rut,
        legalName: proposal.account.legalName,
        industry: proposal.account.industry,
        segment: proposal.account.segment ?? (proposal.deal.isLicitacion ? "Sector Público" : null),
        notes: proposal.requerimiento?.slice(0, 2000) ?? null,
      },
      select: { id: true, name: true },
    });
    accountReused = false;
  }

  let contactId = thread.contactId ?? undefined;
  if (proposal.contact.email || proposal.contact.firstName) {
    const email = proposal.contact.email;
    if (email) {
      const existing = await prisma.crmContact.findFirst({
        where: {
          tenantId,
          accountId: account.id,
          email: { equals: email, mode: "insensitive" },
        },
        select: { id: true },
      });
      if (existing) contactId = existing.id;
    }
    if (!contactId) {
      const created = await prisma.crmContact.create({
        data: {
          tenantId,
          accountId: account.id,
          firstName: proposal.contact.firstName ?? "Contacto",
          lastName: proposal.contact.lastName ?? "",
          email: proposal.contact.email,
          phone: proposal.contact.phone,
          roleTitle: proposal.contact.roleTitle,
          isPrimary: true,
        },
        select: { id: true },
      });
      contactId = created.id;
    }
  }

  const dealTitle =
    proposal.deal.title?.trim() ||
    (proposal.deal.isLicitacion
      ? `Consulta / Licitación — ${accountName}`
      : `Oportunidad — ${accountName}`);

  const primaryInst = proposal.installations[0];
  const deal = await prisma.crmDeal.create({
    data: {
      tenantId,
      accountId: account.id,
      stageId: stage.id,
      title: dealTitle,
      amount: 0,
      isLicitacion: proposal.deal.isLicitacion,
      primaryContactId: contactId ?? null,
      notes: buildDealNotes(proposal),
      fechaEntrega: proposal.deal.fechaLimite
        ? new Date(`${proposal.deal.fechaLimite}T12:00:00Z`)
        : null,
      installationName: primaryInst?.name ?? null,
      address: primaryInst?.address ?? null,
      city: primaryInst?.city ?? null,
      commune: primaryInst?.commune ?? null,
      totalPuestos: proposal.staffingTotals.headcountBase,
      service: proposal.requerimiento?.slice(0, 200) ?? null,
    },
  });

  const createdInstallations: Array<{ id: string; name: string; url: string }> = [];
  for (const inst of proposal.installations) {
    const meta = installationMetadata(proposal, inst.name);
    const row = await prisma.crmInstallation.create({
      data: {
        tenantId,
        accountId: account.id,
        name: inst.name,
        address: inst.address,
        city: inst.city,
        commune: inst.commune,
        status: "prospect",
        notes: inst.coverageSlots
          .map((s) => `${s.name}: cob. ${s.simultaneous} → dot. ${s.headcount} (${s.pattern})`)
          .join(" · ")
          .slice(0, 2000),
        metadata: (meta ?? undefined) as Prisma.InputJsonValue | undefined,
      },
      select: { id: true, name: true },
    });
    createdInstallations.push({
      id: row.id,
      name: row.name,
      url: `/crm/installations/${row.id}`,
    });
  }

  for (const f of files) {
    await attach(tenantId, userId, f, "deal", deal.id);
  }

  await prisma.crmEmailThread.update({
    where: { id: thread.id },
    data: {
      accountId: account.id,
      dealId: deal.id,
      ...(contactId ? { contactId } : {}),
    },
  });

  if (proposal.deal.isLicitacion) {
    const { syncLicitacionToCalendar } = await import("@/modules/agenda/agenda-sync");
    await syncLicitacionToCalendar(tenantId, deal.id).catch((e) =>
      console.error("[email-to-crm-structure] sync licitación:", e),
    );
  }

  // Verdad verificada
  const check = await prisma.crmDeal.findFirst({
    where: { id: deal.id, tenantId },
    select: { id: true },
  });
  if (!check) return { ok: false, error: "No se pudo confirmar la creación del deal." };

  return {
    ok: true,
    accountId: account.id,
    accountUrl: `/crm/accounts/${account.id}`,
    accountReused,
    contactId,
    contactUrl: contactId ? `/crm/contacts/${contactId}` : undefined,
    dealId: deal.id,
    dealUrl: `/crm/deals/${deal.id}`,
    installations: createdInstallations,
    note:
      `Estructura creada: ${accountReused ? "cuenta reutilizada" : "cuenta nueva"}, ` +
      `${createdInstallations.length} instalación(es), dotación base ${proposal.staffingTotals.headcountBase}. ` +
      `La cotización (puestos CPQ) es el siguiente paso — aún no se creó.`,
  };
}
