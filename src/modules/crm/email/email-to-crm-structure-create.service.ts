import { Prisma } from "@prisma/client";
import { addBusinessDays, subBusinessDays } from "date-fns";
import { prisma } from "@/lib/prisma";
import { STORAGE_PROVIDER } from "@/lib/storage";
import { enqueueCrmFileToDrive } from "@/lib/google-workspace/drive-enqueue-hooks";
import type { StagedFile } from "./email-to-lead.types";
import type {
  CreateCrmStructureInclude,
  CreateCrmStructureResult,
  CrmStructureProposal,
} from "./email-to-crm-structure.types";
import { coerceCrmStructureProposal } from "./email-to-crm-structure.service";
import { createThreadTask } from "./correos-tasks";
import { anchorStructureConversation } from "./anchor-structure-conversation";
import type { CrmStructureRefineAnswer } from "./email-to-crm-structure.types";

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

/** Defaults idénticos al comportamiento histórico cuando `include` es undefined. */
export function resolveCreateInclude(
  include?: CreateCrmStructureInclude,
): Required<CreateCrmStructureInclude> {
  return {
    contact: include?.contact !== false,
    deal: include?.deal !== false,
    installations: include?.installations !== false,
    attachments: include?.attachments !== false,
    followUpTask: include?.followUpTask === true,
    quote: include?.quote === true,
    milestones: include?.milestones === true,
  };
}

function followUpDueAt(fechaLimite: string | null): Date {
  if (fechaLimite) {
    const limit = new Date(`${fechaLimite}T12:00:00Z`);
    if (!Number.isNaN(limit.getTime())) {
      return subBusinessDays(limit, 5);
    }
  }
  return addBusinessDays(new Date(), 3);
}

/** Crea cuenta + contacto + deal + N instalaciones desde la propuesta confirmada. */
export async function createCrmStructureFromProposal(params: {
  tenantId: string;
  userId: string;
  emailAccountId: string;
  threadId: string;
  proposal: CrmStructureProposal;
  stagedFiles: StagedFile[];
  /** Si es undefined, comportamiento idéntico al histórico (tool del chat). */
  include?: CreateCrmStructureInclude;
  /** Respuestas de refinamiento a persistir en la conversación anclada. */
  refineAnswers?: CrmStructureRefineAnswer[];
}): Promise<CreateCrmStructureResult> {
  const { tenantId, userId, emailAccountId, threadId } = params;
  const proposal = coerceCrmStructureProposal(params.proposal);
  const flags = resolveCreateInclude(params.include);
  const skipped: string[] = [];

  if (!proposal.account.name?.trim()) {
    return { ok: false, error: "La propuesta no tiene nombre de cuenta." };
  }
  // Con include histórico (undefined) o installations:true, exigir instalaciones.
  if (flags.installations && proposal.installations.length === 0) {
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

  // Exigir etapa antes de escribir la cuenta si puede hacer falta crear un deal
  // (comportamiento histórico de la tool del chat).
  let stageId: string | null = null;
  if (flags.deal) {
    const stage = await prisma.crmPipelineStage.findFirst({
      where: { tenantId, isActive: true },
      orderBy: { order: "asc" },
      select: { id: true },
    });
    // Si el hilo ya tiene deal y estamos en Command Layer, la etapa no es
    // obligatoria (se reutiliza). En el path del chat (include undefined) sí.
    const mayReuseDeal = params.include !== undefined && Boolean(thread.dealId);
    if (!stage && !mayReuseDeal) {
      return { ok: false, error: "No hay etapas de pipeline configuradas." };
    }
    stageId = stage?.id ?? null;
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
  if (!flags.contact) {
    skipped.push("contact");
  } else if (proposal.contact.email || proposal.contact.firstName) {
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

  let dealId: string | undefined;
  let agendaSync: CreateCrmStructureResult["agendaSync"];
  let dealUrl: string | undefined;
  const createdInstallations: Array<{ id: string; name: string; url: string }> = [];

  if (!flags.deal) {
    skipped.push("deal");
    if (flags.installations) skipped.push("installations");
    if (flags.attachments) skipped.push("attachments");
    if (flags.followUpTask) skipped.push("followUpTask");
  } else {
    // Solo en el Command Layer (include explícito): reutilizar deal del hilo.
    // La tool del chat (include undefined) siempre crea un deal nuevo.
    if (params.include !== undefined && thread.dealId) {
      const existingDeal = await prisma.crmDeal.findFirst({
        where: { id: thread.dealId, tenantId },
        select: { id: true },
      });
      if (existingDeal) {
        dealId = existingDeal.id;
        dealUrl = `/crm/deals/${existingDeal.id}`;
      }
    }

    if (!dealId) {
      if (!stageId) {
        return { ok: false, error: "No hay etapas de pipeline configuradas." };
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
          stageId,
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
      dealId = deal.id;
      dealUrl = `/crm/deals/${deal.id}`;

      if (proposal.deal.isLicitacion) {
        const pastDeadline =
          proposal.deal.fechaLimite &&
          proposal.deal.fechaLimite < new Date().toISOString().slice(0, 10);
        if (pastDeadline) {
          agendaSync = {
            attempted: false,
            ok: false,
            skippedReason: "fecha_pasada",
          };
        } else if (!proposal.deal.fechaLimite) {
          agendaSync = {
            attempted: false,
            ok: false,
            skippedReason: "sin_fecha",
          };
        } else {
          const { syncLicitacionToCalendar } = await import("@/modules/agenda/agenda-sync");
          try {
            const sync = await syncLicitacionToCalendar(tenantId, deal.id);
            agendaSync = {
              attempted: true,
              ok: sync.syncStatus !== "ERROR",
            };
          } catch (e) {
            console.error("[email-to-crm-structure] sync licitación:", e);
            agendaSync = { attempted: true, ok: false, skippedReason: "error" };
          }
        }
      }
    }

    if (flags.installations) {
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
    } else {
      skipped.push("installations");
    }

    if (flags.attachments && dealId) {
      for (const f of files) {
        await attach(tenantId, userId, f, "deal", dealId);
      }
    } else if (!flags.attachments) {
      skipped.push("attachments");
    }
  }

  await prisma.crmEmailThread.update({
    where: { id: thread.id },
    data: {
      accountId: account.id,
      ...(dealId ? { dealId } : {}),
      ...(contactId ? { contactId } : {}),
    },
  });

  let taskId: string | undefined;
  if (flags.followUpTask && dealId) {
    const dueAt = followUpDueAt(proposal.deal.fechaLimite);
    const title = proposal.deal.isLicitacion
      ? `Seguimiento licitación — ${accountName}`
      : `Seguimiento oportunidad — ${accountName}`;
    const task = await createThreadTask({
      tenantId,
      userId,
      threadId: thread.id,
      title,
      dueAt,
      allDay: true,
    });
    taskId = task?.id;
  } else if (flags.followUpTask && !dealId) {
    skipped.push("followUpTask");
  }

  if (dealId) {
    const check = await prisma.crmDeal.findFirst({
      where: { id: dealId, tenantId },
      select: { id: true },
    });
    if (!check) return { ok: false, error: "No se pudo confirmar la creación del deal." };
  }

  let conversationId: string | undefined;
  if (dealId) {
    conversationId = await anchorStructureConversation({
      tenantId,
      userId,
      dealId,
      proposal,
      answers: params.refineAnswers,
    });
  }

  const noteParts = [
    `Estructura: ${accountReused ? "cuenta reutilizada" : "cuenta nueva"}`,
    dealId
      ? thread.dealId === dealId
        ? "negocio existente"
        : "negocio nuevo"
      : "sin negocio",
    flags.installations
      ? `${createdInstallations.length} instalación(es)`
      : "instalaciones omitidas",
    flags.deal
      ? `dotación base ${proposal.staffingTotals.headcountBase}`
      : null,
  ].filter(Boolean);

  return {
    ok: true,
    accountId: account.id,
    accountUrl: `/crm/accounts/${account.id}`,
    accountReused,
    contactId,
    contactUrl: contactId ? `/crm/contacts/${contactId}` : undefined,
    dealId,
    dealUrl,
    installations: createdInstallations,
    taskId,
    skipped: skipped.length ? skipped : undefined,
    agendaSync,
    conversationId,
    note:
      noteParts.join(", ") +
      ". La cotización (puestos CPQ) es el siguiente paso — aún no se creó.",
  };
}
