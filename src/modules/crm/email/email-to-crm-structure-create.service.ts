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
  PlanAttachmentSelection,
  PlanMilestone,
  PlanQuoteInput,
  PlanTaskOverride,
} from "./email-to-crm-structure.types";
import { coerceCrmStructureProposal } from "./email-to-crm-structure.service";
import { syncAssumptionArrays } from "./email-to-crm-structure.types";
import { createThreadTask } from "./correos-tasks";
import { anchorStructureConversation } from "./anchor-structure-conversation";
import type { CrmStructureRefineAnswer } from "./email-to-crm-structure.types";
import { clearPlanDraft } from "./plan-draft";

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

/** Exportado para tests: filtra supuestos eliminados. */
export function buildDealNotes(proposal: CrmStructureProposal): string {
  const synced = syncAssumptionArrays(proposal);
  const activeAssumptions =
    synced.assumptionItems?.filter((a) => !a.removed).map((a) => a.text) ??
    synced.assumptions;
  const lines: string[] = [];
  if (synced.requerimiento) lines.push(synced.requerimiento);
  if (synced.coverageIsRequirementNotStaffing) {
    lines.push(
      "Documento define COBERTURA (no dotación). Dotación propuesta Gard calculada a " +
        `${synced.weeklyHoursPerWorker} h/sem.`,
    );
  }
  const t = synced.staffingTotals;
  const reserveLabel = synced.reservePct ?? 10;
  lines.push(
    `Dotación propuesta: ${t.headcountBase} base` +
      (t.reserveHeadcount
        ? ` + ${t.reserveHeadcount} reserva (~${reserveLabel}%) = ${t.headcountWithReserve}`
        : "") +
      ` · HH/sem ${t.weeklyHH} · mínimo legal ceil(HH/${synced.weeklyHoursPerWorker})=${t.legalMinimum}`,
  );
  for (const inst of synced.installations) {
    const slots = inst.coverageSlots
      .map(
        (s) =>
          `  - ${s.name}: cobertura ${s.simultaneous} → dotación ${s.headcount} (${s.pattern}) ${s.horaInicio}-${s.horaFin}`,
      )
      .join("\n");
    lines.push(`Instalación ${inst.name}:\n${slots || "  (sin slots)"}`);
  }
  if (activeAssumptions.length) {
    lines.push("Supuestos: " + activeAssumptions.join(" · "));
  }
  if (synced.openQuestions.length) {
    lines.push("Pendientes: " + synced.openQuestions.join(" · "));
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

export function followUpDueAt(
  fechaLimite: string | null,
  overrideDueAt?: string | null,
): Date {
  if (overrideDueAt) {
    const d = new Date(overrideDueAt);
    if (!Number.isNaN(d.getTime())) return d;
  }
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
  taskOverride?: PlanTaskOverride;
  attachmentSelection?: PlanAttachmentSelection;
  quoteInput?: PlanQuoteInput;
  milestones?: PlanMilestone[];
  /** Permisos resueltos en la ruta; sin ellos se reporta skipped. */
  canCreateQuote?: boolean;
  canCreateMilestones?: boolean;
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

  let files = params.stagedFiles.filter(
    (f) => f.storageKey.startsWith(`${tenantId}/`) && f.storageKey.includes("chat-staged"),
  );
  // Intersección con selección del cliente (nunca reemplazo).
  if (params.attachmentSelection?.storageKeys?.length) {
    const allowed = new Set(params.attachmentSelection.storageKeys);
    files = files.filter((f) => allowed.has(f.storageKey));
  }
  const attachTarget = params.attachmentSelection?.target ?? "deal";

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
  let quoteId: string | undefined;
  let quoteUrl: string | undefined;
  let milestoneResults: NonNullable<CreateCrmStructureResult["milestones"]> = [];
  let createdNewDeal = false;
  const createdInstallations: Array<{ id: string; name: string; url: string }> = [];

  if (!flags.deal) {
    skipped.push("deal");
    if (flags.installations) skipped.push("installations");
    if (flags.attachments) skipped.push("attachments");
    if (flags.followUpTask) skipped.push("followUpTask");
    if (flags.quote) skipped.push("quote");
    if (flags.milestones) skipped.push("milestones");
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
      createdNewDeal = true;
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

    // Hitos de licitación (antes de banda all-day para alinear fechaEntrega).
    if (flags.milestones) {
      if (!params.canCreateMilestones) {
        skipped.push("milestones");
      } else if (!dealId || !proposal.deal.isLicitacion) {
        skipped.push("milestones");
      } else {
        const { createDealMilestoneEvent, milestoneRangeFromPlan } = await import(
          "@/modules/agenda/deal-milestones"
        );
        const today = new Date().toISOString().slice(0, 10);
        for (const m of params.milestones ?? []) {
          if (m.enabled === false) continue;
          if (m.date < today) continue;
          const range = milestoneRangeFromPlan(m);
          if (!range) continue;
          if (m.kind === "entrega" && m.date !== proposal.deal.fechaLimite) {
            await prisma.crmDeal.update({
              where: { id: dealId },
              data: { fechaEntrega: new Date(`${m.date}T12:00:00Z`) },
            });
            proposal.deal.fechaLimite = m.date;
          }
          try {
            const created = await createDealMilestoneEvent({
              tenantId,
              actorUserId: userId,
              dealId,
              accountId: account.id,
              installationId: createdInstallations[0]?.id ?? null,
              kind: m.kind,
              startAt: range.startAt,
              endAt: range.endAt,
              notes: m.notes,
              participantIds: m.participantIds,
              externalEmails: m.externalEmails,
            });
            milestoneResults.push({
              kind: m.kind,
              eventId: created.eventId,
              syncStatus: created.syncStatus,
            });
            if (m.kind === "visita_tecnica") {
              await prisma.crmDeal.update({
                where: { id: dealId },
                data: { technicalVisitDate: new Date(`${m.date}T12:00:00Z`) },
              });
            }
          } catch (e) {
            console.error("[email-to-crm-structure] hito:", m.kind, e);
          }
        }
      }
    }

    // Banda all-day de licitación (solo en deal nuevo, igual que antes).
    if (proposal.deal.isLicitacion && dealId && createdNewDeal) {
      const pastDeadline =
        proposal.deal.fechaLimite &&
        proposal.deal.fechaLimite < new Date().toISOString().slice(0, 10);
      if (pastDeadline) {
        agendaSync = { attempted: false, ok: false, skippedReason: "fecha_pasada" };
      } else if (!proposal.deal.fechaLimite) {
        agendaSync = { attempted: false, ok: false, skippedReason: "sin_fecha" };
      } else {
        const { syncLicitacionToCalendar } = await import("@/modules/agenda/agenda-sync");
        try {
          const sync = await syncLicitacionToCalendar(tenantId, dealId);
          agendaSync = { attempted: true, ok: sync.syncStatus !== "ERROR" };
        } catch (e) {
          console.error("[email-to-crm-structure] sync licitación:", e);
          agendaSync = { attempted: true, ok: false, skippedReason: "error" };
        }
      }
    }

    // Cotización CPQ borrador.
    if (flags.quote) {
      if (!params.canCreateQuote) {
        skipped.push("quote");
      } else if (!dealId) {
        skipped.push("quote");
      } else {
        try {
          const { createPlanQuote } = await import("./plan-create-quote");
          const q = await createPlanQuote({
            tenantId,
            userId,
            dealId,
            accountId: account.id,
            contactId,
            installationId: createdInstallations[0]?.id,
            proposal,
            quoteInput: params.quoteInput,
          });
          quoteId = q.quoteId;
          quoteUrl = q.quoteUrl;
        } catch (e) {
          console.error("[email-to-crm-structure] quote:", e);
          skipped.push("quote");
        }
      }
    }

    if (flags.attachments && dealId) {
      for (const f of files) {
        if (attachTarget === "account" || attachTarget === "both") {
          await attach(tenantId, userId, f, "account", account.id);
        }
        if (attachTarget === "deal" || attachTarget === "both") {
          await attach(tenantId, userId, f, "deal", dealId);
        }
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
    const ov = params.taskOverride;
    const dueAt = followUpDueAt(proposal.deal.fechaLimite, ov?.dueAt);
    const title =
      ov?.title?.trim() ||
      (proposal.deal.isLicitacion
        ? `Seguimiento licitación — ${accountName}`
        : `Seguimiento oportunidad — ${accountName}`);
    const allDay = ov?.allDay ?? true;
    const task = await createThreadTask({
      tenantId,
      userId,
      threadId: thread.id,
      title,
      dueAt,
      allDay,
    });
    taskId = task?.id;
    if (taskId && ov?.assigneeIds?.length) {
      const valid = await prisma.admin.findMany({
        where: { tenantId, id: { in: ov.assigneeIds }, status: "active" },
        select: { id: true },
      });
      if (valid.length) {
        await prisma.crmTaskAssignee.createMany({
          data: valid.map((a) => ({ taskId: taskId!, userId: a.id })),
          skipDuplicates: true,
        });
        await prisma.crmTask.update({
          where: { id: taskId },
          data: { assignedTo: valid[0].id },
        });
      }
    }
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
    // Anclar conversación con supuestos no eliminados.
    const forAnchor = syncAssumptionArrays(proposal);
    conversationId = await anchorStructureConversation({
      tenantId,
      userId,
      dealId,
      proposal: forAnchor,
      answers: params.refineAnswers,
    });
  }

  await clearPlanDraft({ tenantId, threadId, emailAccountId }).catch(() => undefined);

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
    quoteId ? "cotización borrador creada" : null,
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
    quoteId,
    quoteUrl,
    milestones: milestoneResults.length ? milestoneResults : undefined,
    skipped: skipped.length ? skipped : undefined,
    agendaSync,
    conversationId,
    note: noteParts.join(", ") + (quoteId ? "." : ". Cotización CPQ: armar puestos en el workspace."),
  };
}
