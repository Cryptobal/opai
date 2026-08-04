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
  SkipReason,
} from "./email-to-crm-structure.types";
import { coerceCrmStructureProposal } from "./email-to-crm-structure.service";
import { syncAssumptionArrays } from "./email-to-crm-structure.types";
import { createThreadTask } from "./correos-tasks";
import { anchorStructureConversation } from "./anchor-structure-conversation";
import type { CrmStructureRefineAnswer } from "./email-to-crm-structure.types";
import { clearPlanDraft } from "./plan-draft";
import { selectedProposalContacts } from "./structure-contacts";

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

/** Nota auditable con el piso económico del pliego (exportada para tests). */
export function buildCondicionesEconomicasNote(
  proposal: CrmStructureProposal,
): string | null {
  const ce = proposal.condicionesEconomicas;
  if (!ce) return null;
  const lines: string[] = ["Condiciones económicas del pliego (extracción IA — confirmar):"];
  if (ce.sueldoBaseMinimo != null) {
    lines.push(`- Sueldo base mínimo exigido: $${ce.sueldoBaseMinimo.toLocaleString("es-CL")} CLP/mes`);
  }
  if (ce.gratificacionPct != null) {
    lines.push(`- Gratificación: ${ce.gratificacionPct}%`);
  }
  if (ce.movilizacion != null) {
    lines.push(`- Movilización: $${ce.movilizacion.toLocaleString("es-CL")} CLP`);
  }
  if (ce.colacionProvistaPorCliente != null) {
    lines.push(
      `- Colación: ${ce.colacionProvistaPorCliente ? "provista por el cliente" : "a cargo del oferente"}`,
    );
  }
  if (ce.reservaPct != null) {
    lines.push(`- Reserva / contingencia exigida: ${ce.reservaPct}%`);
  }
  if (ce.beneficiosExigidos.length) {
    lines.push(`- Beneficios exigidos: ${ce.beneficiosExigidos.join("; ")}`);
  }
  if (ce.multas.length) {
    lines.push(
      "- Multas (UF): " +
        ce.multas.map((m) => `${m.concepto} (${m.montoUf} UF)`).join("; "),
    );
  }
  if (ce.kpis.length) {
    lines.push(
      "- KPI: " + ce.kpis.map((k) => `${k.indicador}: ${k.meta}`).join("; "),
    );
  }
  if (ce.inadmisibleSiNoCumpleRemuneracion) {
    lines.push(
      "- ADVERTENCIA: el pliego declara inadmisibilidad por incumplimiento remuneracional. La cotización no puede quedar bajo el piso salarial.",
    );
  }
  if (lines.length <= 1) return null;
  return lines.join("\n").slice(0, 2000);
}

function installationMetadata(proposal: CrmStructureProposal, instName: string) {
  const inst = proposal.installations.find((i) => i.name === instName);
  if (!inst) return null;
  return {
    origen: "correo_ia_crm_structure",
    coverageIsRequirementNotStaffing: proposal.coverageIsRequirementNotStaffing,
    weeklyHoursPerWorker: proposal.weeklyHoursPerWorker,
    coverageSlots: inst.coverageSlots,
    ...(inst.mapsUrl ? { mapsUrl: inst.mapsUrl } : {}),
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
  const skippedDetail: Array<{ id: string; reason: SkipReason }> = [];
  const skip = (id: string, reason: SkipReason) => {
    skipped.push(id);
    skippedDetail.push({ id, reason });
  };

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

  // Etapa de pipeline solo si se va a crear/reutilizar deal.
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

  const { isOwnCompanyAccount, loadOwnTenant } = await import(
    "@/modules/crm/email/own-tenant-company"
  );
  const ownTenant = await loadOwnTenant(tenantId);
  if (isOwnCompanyAccount({ name: accountName }, ownTenant)) {
    return {
      ok: false,
      error:
        "La propuesta apunta a la cuenta de tu propia empresa. Indicá el cliente real (no Gard / tu tenant) y reintentá.",
    };
  }

  // Reutilizar cuenta existente por nombre exacto (case-insensitive) en el tenant.
  // Nunca reutilizar la cuenta propia del tenant aunque el nombre coincida.
  let account = await prisma.crmAccount.findFirst({
    where: { tenantId, name: { equals: accountName, mode: "insensitive" } },
    select: { id: true, name: true, website: true },
  });
  if (account && isOwnCompanyAccount(account, ownTenant)) {
    account = null;
  }
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
      select: { id: true, name: true, website: true },
    });
    accountReused = false;
  }

  // Contactos — independientes del deal. Crea todos los seleccionados
  // (contacts[] o el contact primario legacy); el primero es primary del hilo.
  let contactId = thread.contactId ?? undefined;
  const contactsToCreate = selectedProposalContacts({
    contact: proposal.contact,
    contacts: proposal.contacts,
  });
  if (!flags.contact) {
    skip("contact", "no_seleccionado");
  } else if (contactsToCreate.length === 0) {
    skip("contact", "sin_datos");
  } else {
    let primarySet = Boolean(contactId);
    for (const c of contactsToCreate) {
      let id: string | undefined;
      if (c.email) {
        const existing = await prisma.crmContact.findFirst({
          where: {
            tenantId,
            accountId: account.id,
            email: { equals: c.email, mode: "insensitive" },
          },
          select: { id: true },
        });
        if (existing) id = existing.id;
      }
      if (!id) {
        const created = await prisma.crmContact.create({
          data: {
            tenantId,
            accountId: account.id,
            firstName: c.firstName ?? "Contacto",
            lastName: c.lastName ?? "",
            email: c.email,
            phone: c.phone,
            roleTitle: c.roleTitle,
            isPrimary: !primarySet,
          },
          select: { id: true },
        });
        id = created.id;
        primarySet = true;
      }
      if (!contactId) contactId = id;
    }
  }

  // Instalaciones — cuelgan de la cuenta; no requieren deal.
  const createdInstallations: Array<{ id: string; name: string; url: string }> = [];
  if (!flags.installations) {
    skip("installations", "no_seleccionado");
  } else {
    for (const inst of proposal.installations) {
      const meta = installationMetadata(proposal, inst.name);
      const hasCoords =
        typeof inst.lat === "number" &&
        Number.isFinite(inst.lat) &&
        typeof inst.lng === "number" &&
        Number.isFinite(inst.lng);
      const row = await prisma.crmInstallation.create({
        data: {
          tenantId,
          accountId: account.id,
          name: inst.name,
          address: inst.address,
          city: inst.city,
          commune: inst.commune,
          ...(hasCoords ? { lat: inst.lat!, lng: inst.lng! } : {}),
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
      try {
        await prisma.crmEmailThreadLink.upsert({
          where: {
            threadId_entityType_entityId: {
              threadId: thread.id,
              entityType: "installation",
              entityId: row.id,
            },
          },
          create: {
            tenantId,
            threadId: thread.id,
            entityType: "installation",
            entityId: row.id,
            linkedVia: "ai",
            createdBy: userId,
          },
          update: {},
        });
      } catch (linkErr) {
        console.error("[email-to-crm-structure] thread link installation:", linkErr);
      }
    }
  }

  // Negocio — opcional.
  let dealId: string | undefined;
  let dealUrl: string | undefined;
  let createdNewDeal = false;
  let positionsCreated = 0;
  let agendaSync: CreateCrmStructureResult["agendaSync"];
  let quoteId: string | undefined;
  let quoteUrl: string | undefined;
  let bundleId: string | undefined;
  let bundleCode: string | undefined;
  let bundleUrl: string | undefined;
  let quotes: CreateCrmStructureResult["quotes"];
  let milestoneResults: NonNullable<CreateCrmStructureResult["milestones"]> = [];

  if (!flags.deal) {
    skip("deal", "no_seleccionado");
  } else {
    // Solo en el Command Layer (include explícito): reutilizar deal del hilo.
    // La tool del chat (include undefined) siempre crea un deal nuevo.
    // Nunca reutilizar un negocio de OTRA cuenta: eso deja el hilo con
    // accountId=A y dealId de B (p. ej. Gard Security + Residencia Embajador).
    if (params.include !== undefined && thread.dealId) {
      const existingDeal = await prisma.crmDeal.findFirst({
        where: { id: thread.dealId, tenantId, accountId: account.id },
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

      // Preferir instalación recién creada; si no, la de la propuesta.
      const primaryInst = createdInstallations[0]
        ? proposal.installations.find((i) => i.name === createdInstallations[0].name) ??
          proposal.installations[0]
        : proposal.installations[0];
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
  }

  // Contacto ↔ negocio (además de primaryContactId en deals nuevos).
  if (dealId && contactId) {
    try {
      await prisma.crmDealContact.create({
        data: {
          tenantId,
          dealId,
          contactId,
          role: "primary",
        },
      });
    } catch (dcErr: unknown) {
      const code =
        dcErr && typeof dcErr === "object" && "code" in dcErr
          ? (dcErr as { code: string }).code
          : "";
      if (code !== "P2002") {
        console.error("[email-to-crm-structure] deal contact:", dcErr);
      }
    }
    if (!createdNewDeal) {
      await prisma.crmDeal
        .updateMany({
          where: { id: dealId, tenantId, primaryContactId: null },
          data: { primaryContactId: contactId },
        })
        .catch(() => undefined);
    }
  }

  // Hitos de licitación — requieren deal.
  if (flags.milestones) {
    if (!params.canCreateMilestones) {
      skip("milestones", "sin_permiso");
    } else if (!dealId) {
      skip("milestones", "requiere_negocio");
    } else if (!proposal.deal.isLicitacion) {
      skip("milestones", "sin_datos");
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
            allDay: range.allDay,
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

  // Banda all-day de licitación (solo en deal nuevo).
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

  // Nota estructurada con piso económico del pliego (auditable en el deal).
  if (dealId && proposal.condicionesEconomicas) {
    const ecoNote = buildCondicionesEconomicasNote(proposal);
    if (ecoNote) {
      try {
        await prisma.crmNote.create({
          data: {
            tenantId,
            entityType: "deal",
            entityId: dealId,
            content: ecoNote,
            createdBy: userId,
            interactionType: "note",
          },
        });
      } catch (e) {
        console.error("[email-to-crm-structure] nota económica:", e);
      }
    }
  }

  // Cotización CPQ borrador — deal opcional (dealId nullable en schema).
  // Si el plan no marcó "negocio" pero el hilo ya tiene uno de la misma cuenta,
  // reutilizarlo para CrmDealQuote (cascada "Crear Cotización con IA").
  if (flags.quote && !dealId && thread.dealId) {
    const existingDealForQuote = await prisma.crmDeal.findFirst({
      where: { id: thread.dealId, tenantId, accountId: account.id },
      select: { id: true },
    });
    if (existingDealForQuote) {
      dealId = existingDealForQuote.id;
      dealUrl = `/crm/deals/${existingDealForQuote.id}`;
    }
  }
  if (flags.quote) {
    if (!params.canCreateQuote) {
      skip("quote", "sin_permiso");
    } else {
      const installationsWithSlots = proposal.installations
        .map((inst, idx) => ({ inst, idx }))
        .filter(({ inst }) => inst.coverageSlots.length > 0);

      if (installationsWithSlots.length >= 2) {
        if (!dealId) {
          skip("quote", "requiere_negocio");
        } else {
          try {
            const { createPlanQuotesMultiInstallation } = await import(
              "./plan-create-quote-multi"
            );
            const multi = await createPlanQuotesMultiInstallation({
              tenantId,
              userId,
              dealId,
              accountId: account.id,
              contactId,
              threadId: thread.id,
              proposal,
              quoteInput: params.quoteInput,
              createdInstallations: createdInstallations.map((c) => ({
                id: c.id,
                name: c.name,
              })),
            });
            bundleId = multi.bundleId;
            bundleCode = multi.bundleCode;
            bundleUrl = multi.bundleUrl;
            quotes = multi.quotes;
            quoteId = multi.quotes[0]?.id;
            quoteUrl = multi.bundleUrl;
            positionsCreated = multi.positionsCreated;
          } catch (e) {
            console.error("[email-to-crm-structure] quote multi:", e);
            skip("quote", "error");
          }
        }
      } else {
        try {
          const { createPlanQuote } = await import("./plan-create-quote");
          const sole = installationsWithSlots[0];
          const consumed = new Set<string>();
          let installationId: string | undefined;
          if (sole) {
            const match = createdInstallations.find(
              (c) => c.name === sole.inst.name && !consumed.has(c.id),
            );
            if (match) {
              consumed.add(match.id);
              installationId = match.id;
            }
          }
          if (!installationId) {
            installationId = createdInstallations[0]?.id;
          }
          const q = await createPlanQuote({
            tenantId,
            userId,
            dealId: dealId ?? null,
            accountId: account.id,
            contactId,
            installationId,
            threadId: thread.id,
            proposal,
            quoteInput: params.quoteInput,
            onlyInstallationIndex: sole?.idx,
          });
          quoteId = q.quoteId;
          quoteUrl = q.quoteUrl;
          positionsCreated = q.positionsCreated;
        } catch (e) {
          console.error("[email-to-crm-structure] quote:", e);
          skip("quote", "error");
        }
      }
    }
  }

  // Adjuntos — sin deal fuerzan destino cuenta.
  if (!flags.attachments) {
    skip("attachments", "no_seleccionado");
  } else {
    const effectiveTarget = dealId ? attachTarget : "account";
    for (const f of files) {
      if (effectiveTarget === "account" || effectiveTarget === "both") {
        await attach(tenantId, userId, f, "account", account.id);
      }
      if (dealId && (effectiveTarget === "deal" || effectiveTarget === "both")) {
        await attach(tenantId, userId, f, "deal", dealId);
      }
    }
  }

  // Actualizar hilo: account siempre; deal/contact solo si existen (no desvincula).
  await prisma.crmEmailThread.update({
    where: { id: thread.id },
    data: {
      accountId: account.id,
      ...(dealId ? { dealId } : {}),
      ...(contactId ? { contactId } : {}),
    },
  });

  // Tarea de seguimiento — thread-scoped; no requiere deal.
  let taskId: string | undefined;
  if (flags.followUpTask) {
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
    contactId ? "contacto" : null,
    dealId
      ? thread.dealId === dealId
        ? "negocio existente"
        : "negocio nuevo"
      : "sin negocio",
    flags.installations
      ? `${createdInstallations.length} instalación(es)`
      : "instalaciones omitidas",
    bundleId
      ? `propuesta ${bundleCode ?? "PROP"} con ${quotes?.length ?? 0} cotización(es) · ${positionsCreated} puesto(s)`
      : quoteId
        ? positionsCreated > 0
          ? `cotización borrador con ${positionsCreated} puesto(s)${dealId ? "" : " (sin negocio)"}`
          : `cotización borrador${dealId ? "" : " (sin negocio)"}`
        : null,
    taskId ? "tarea de seguimiento" : null,
    flags.attachments ? "adjuntos guardados" : null,
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
    bundleId,
    bundleCode,
    bundleUrl,
    quotes,
    milestones: milestoneResults.length ? milestoneResults : undefined,
    skipped: skipped.length ? skipped : undefined,
    skippedDetail: skippedDetail.length ? skippedDetail : undefined,
    agendaSync,
    conversationId,
    note: noteParts.join(", ") + ".",
  };
}
