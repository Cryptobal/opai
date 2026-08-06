import { Prisma } from "@prisma/client";
import { addBusinessDays, subBusinessDays } from "date-fns";
import { prisma } from "@/lib/prisma";
import { STORAGE_PROVIDER } from "@/lib/storage";
import { enqueueCrmFileToDrive } from "@/lib/google-workspace/drive-enqueue-hooks";
import type { StagedFile } from "./email-to-lead.types";
import type {
  CreateCrmStructureInclude,
  CreateCrmStructureOnConflict,
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
import {
  conflictsNeedConfirmation,
  detectStructureConflicts,
  pickAutoAccountMatch,
} from "./structure-entity-match";

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

/**
 * Resuelve el contacto primario para deal/hilo.
 * - Prioriza el primer contacto del plan (creado o reutilizado en la cuenta destino).
 * - El contactId del hilo solo se usa si fue validado (existe y pertenece a la cuenta);
 *   `CrmEmailThread.contactId` no tiene FK y puede quedar huérfano → P2003 en deals.
 */
export function resolveStructurePrimaryContactId(params: {
  forceCreateNew: boolean;
  validatedThreadContactId: string | null;
  firstPlanContactId: string | undefined;
}): string | undefined {
  if (params.firstPlanContactId) return params.firstPlanContactId;
  if (params.forceCreateNew) return undefined;
  return params.validatedThreadContactId ?? undefined;
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
  /**
   * Ante registros existentes:
   * - omitido → si hay conflictos, retorna `needsConfirmation` (no crea).
   * - `reuse_overwrite` → reutiliza y actualiza datos del plan.
   * - `create_new` → crea registros nuevos aunque haya similares.
   */
  onConflict?: CreateCrmStructureOnConflict;
  /** Cuenta elegida por el usuario cuando hay varios candidatos. */
  useExistingAccountId?: string;
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
  const onConflict = params.onConflict;
  const forceCreateNew = onConflict === "create_new";

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

  const contactsToCreate = selectedProposalContacts({
    contact: proposal.contact,
    contacts: proposal.contacts,
  });
  const dealTitleForMatch =
    proposal.deal.title?.trim() ||
    (proposal.deal.isLicitacion
      ? `Consulta / Licitación — ${accountName}`
      : `Oportunidad — ${accountName}`);

  // Detección de conflictos ANTES de crear (Command Layer con include explícito).
  // La tool del chat (include undefined) conserva el path histórico más permisivo
  // pero ya no duplica instalaciones/contactos de la misma cuenta.
  const conflicts = await detectStructureConflicts({
    tenantId,
    accountName,
    accountRut: proposal.account.rut,
    threadAccountId: thread.accountId,
    threadDealId: thread.dealId,
    dealTitle: dealTitleForMatch,
    installationNames: proposal.installations.map((i) => i.name),
    contacts: contactsToCreate,
    ownTenant,
    useExistingAccountId: params.useExistingAccountId,
    includeContact: flags.contact,
    includeDeal: flags.deal,
    includeInstallations: flags.installations,
  });

  if (
    params.include !== undefined &&
    onConflict == null &&
    conflictsNeedConfirmation(conflicts)
  ) {
    return {
      ok: false,
      needsConfirmation: true,
      conflicts,
      error:
        "Ya existen registros similares en CRM. Confirmá si querés actualizarlos o crear nuevos.",
    };
  }

  // Resolver cuenta a reutilizar.
  let account: { id: string; name: string; website: string | null; ownerId: string | null } | null =
    null;
  let accountReused = false;

  if (!forceCreateNew) {
    const chosenId =
      params.useExistingAccountId?.trim() ||
      pickAutoAccountMatch(conflicts.accounts)?.id ||
      null;
    if (chosenId) {
      const found = await prisma.crmAccount.findFirst({
        where: { id: chosenId, tenantId },
        select: { id: true, name: true, website: true, ownerId: true },
      });
      if (found && !isOwnCompanyAccount(found, ownTenant)) {
        account = found;
        accountReused = true;
      }
    }
  }

  if (!account) {
    account = await prisma.crmAccount.create({
      data: {
        tenantId,
        name: accountName,
        type: "prospect",
        ownerId: userId,
        rut: proposal.account.rut,
        legalName: proposal.account.legalName,
        industry: proposal.account.industry,
        segment: proposal.account.segment ?? (proposal.deal.isLicitacion ? "Sector Público" : null),
        notes: proposal.requerimiento?.slice(0, 2000) ?? null,
      },
      select: { id: true, name: true, website: true, ownerId: true },
    });
    accountReused = false;
  } else {
    // Actualizar datos del plan sobre la cuenta existente (overwrite).
    await prisma.crmAccount.update({
      where: { id: account.id },
      data: {
        ...(proposal.account.rut ? { rut: proposal.account.rut } : {}),
        ...(proposal.account.legalName ? { legalName: proposal.account.legalName } : {}),
        ...(proposal.account.industry ? { industry: proposal.account.industry } : {}),
        ...(proposal.account.segment
          ? { segment: proposal.account.segment }
          : proposal.deal.isLicitacion
            ? { segment: "Sector Público" }
            : {}),
        ...(proposal.requerimiento
          ? { notes: proposal.requerimiento.slice(0, 2000) }
          : {}),
        ...(!account.ownerId ? { ownerId: userId } : {}),
      },
    });
    if (!account.ownerId) account = { ...account, ownerId: userId };
  }

  // Contactos — independientes del deal. Crea todos los seleccionados
  // (contacts[] o el contact primario legacy); el primero del plan es primary.
  // Importante: thread.contactId NO tiene FK en BD y puede apuntar a un contacto
  // borrado u otra cuenta. Usarlo a ciegas como primaryContactId del deal → P2003.
  let validatedThreadContactId: string | null = null;
  if (thread.contactId && !forceCreateNew) {
    const seed = await prisma.crmContact.findFirst({
      where: { id: thread.contactId, tenantId, accountId: account.id },
      select: { id: true },
    });
    validatedThreadContactId = seed?.id ?? null;
  }

  let firstPlanContactId: string | undefined;
  let contactReused = false;
  if (!flags.contact) {
    skip("contact", "no_seleccionado");
  } else if (contactsToCreate.length === 0) {
    skip("contact", "sin_datos");
  } else {
    let primarySet = Boolean(validatedThreadContactId);
    for (const c of contactsToCreate) {
      let id: string | undefined;
      if (!forceCreateNew) {
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
        if (!id && (c.firstName || c.lastName)) {
          const siblings = await prisma.crmContact.findMany({
            where: { tenantId, accountId: account.id },
            select: { id: true, firstName: true, lastName: true },
            take: 100,
          });
          const norm = [c.firstName ?? "", c.lastName ?? ""]
            .join(" ")
            .toLowerCase()
            .normalize("NFD")
            .replace(/\p{Diacritic}/gu, "")
            .replace(/[^a-z0-9\s]/g, "")
            .replace(/\s+/g, " ")
            .trim();
          const byName = siblings.find((s) => {
            const sn = [s.firstName, s.lastName]
              .join(" ")
              .toLowerCase()
              .normalize("NFD")
              .replace(/\p{Diacritic}/gu, "")
              .replace(/[^a-z0-9\s]/g, "")
              .replace(/\s+/g, " ")
              .trim();
            return sn.length >= 3 && sn === norm;
          });
          if (byName) id = byName.id;
        }
      }
      if (id) {
        contactReused = true;
        await prisma.crmContact.update({
          where: { id },
          data: {
            ...(c.firstName ? { firstName: c.firstName } : {}),
            ...(c.lastName != null ? { lastName: c.lastName } : {}),
            ...(c.email ? { email: c.email } : {}),
            ...(c.phone ? { phone: c.phone } : {}),
            ...(c.roleTitle ? { roleTitle: c.roleTitle } : {}),
          },
        });
      } else {
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
      if (!firstPlanContactId) firstPlanContactId = id;
    }
  }

  const contactId = resolveStructurePrimaryContactId({
    forceCreateNew,
    validatedThreadContactId,
    firstPlanContactId,
  });

  // Instalaciones — cuelgan de la cuenta; no requieren deal.
  // Por defecto reutiliza por nombre (case-insensitive) y sobrescribe datos del plan.
  const createdInstallations: Array<{
    id: string;
    name: string;
    url: string;
    reused?: boolean;
  }> = [];
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
      const notes = inst.coverageSlots
        .map((s) => `${s.name}: cob. ${s.simultaneous} → dot. ${s.headcount} (${s.pattern})`)
        .join(" · ")
        .slice(0, 2000);

      let row: { id: string; name: string } | null = null;
      let reusedInst = false;
      if (!forceCreateNew) {
        const existingInst = await prisma.crmInstallation.findFirst({
          where: {
            tenantId,
            accountId: account.id,
            name: { equals: inst.name, mode: "insensitive" },
          },
          select: { id: true, name: true },
        });
        if (existingInst) {
          row = await prisma.crmInstallation.update({
            where: { id: existingInst.id },
            data: {
              name: inst.name,
              address: inst.address,
              city: inst.city,
              commune: inst.commune,
              ...(hasCoords ? { lat: inst.lat!, lng: inst.lng! } : {}),
              notes,
              metadata: (meta ?? undefined) as Prisma.InputJsonValue | undefined,
            },
            select: { id: true, name: true },
          });
          reusedInst = true;
        }
      }
      if (!row) {
        row = await prisma.crmInstallation.create({
          data: {
            tenantId,
            accountId: account.id,
            name: inst.name,
            address: inst.address,
            city: inst.city,
            commune: inst.commune,
            ...(hasCoords ? { lat: inst.lat!, lng: inst.lng! } : {}),
            status: "prospect",
            notes,
            metadata: (meta ?? undefined) as Prisma.InputJsonValue | undefined,
          },
          select: { id: true, name: true },
        });
      }
      createdInstallations.push({
        id: row.id,
        name: row.name,
        url: `/crm/installations/${row.id}`,
        reused: reusedInst,
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
  let dealReused = false;
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
    // Solo en el Command Layer (include explícito): reutilizar deal del hilo
    // o un open deal con título muy similar en la misma cuenta.
    // Nunca reutilizar un negocio de OTRA cuenta.
    if (params.include !== undefined && !forceCreateNew) {
      const existingDealId = conflicts.deal?.id ?? thread.dealId;
      if (existingDealId) {
        const existingDeal = await prisma.crmDeal.findFirst({
          where: { id: existingDealId, tenantId, accountId: account.id },
          select: { id: true },
        });
        if (existingDeal) {
          dealId = existingDeal.id;
          dealUrl = `/crm/deals/${existingDeal.id}`;
          dealReused = true;
          const primaryInst = createdInstallations[0]
            ? proposal.installations.find((i) => i.name === createdInstallations[0].name) ??
              proposal.installations[0]
            : proposal.installations[0];
          await prisma.crmDeal.update({
            where: { id: dealId },
            data: {
              title: dealTitleForMatch,
              isLicitacion: proposal.deal.isLicitacion,
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
              ...(contactId ? { primaryContactId: contactId } : {}),
            },
          });
        }
      }
    }

    if (!dealId) {
      if (!stageId) {
        return { ok: false, error: "No hay etapas de pipeline configuradas." };
      }

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
          title: dealTitleForMatch,
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

  // Eventos en agenda — requieren deal (cualquier negocio, no solo licitación).
  if (flags.milestones) {
    if (!params.canCreateMilestones) {
      skip("milestones", "sin_permiso");
    } else if (!dealId) {
      skip("milestones", "requiere_negocio");
    } else {
      const { upsertDealMilestoneEvent, milestoneRangeFromPlan } = await import(
        "@/modules/agenda/deal-milestones"
      );
      const { todayInChile } = await import("@/lib/dates-cl");
      const today = todayInChile();
      for (const m of params.milestones ?? []) {
        if (m.enabled === false) continue;
        if (m.date < today) {
          skippedDetail.push({ id: m.id, reason: "sin_datos" });
          continue;
        }
        const range = milestoneRangeFromPlan(m);
        if (!range) {
          skippedDetail.push({ id: m.id, reason: "sin_datos" });
          continue;
        }
        if (m.kind === "entrega" && m.date !== proposal.deal.fechaLimite) {
          await prisma.crmDeal.update({
            where: { id: dealId },
            data: { fechaEntrega: new Date(`${m.date}T12:00:00Z`) },
          });
          proposal.deal.fechaLimite = m.date;
        }
        try {
          const instLoc = proposal.installations[0];
          const address = m.address?.trim() || instLoc?.address?.trim() || null;
          const lat =
            typeof m.lat === "number" && Number.isFinite(m.lat)
              ? m.lat
              : typeof instLoc?.lat === "number" && Number.isFinite(instLoc.lat)
                ? instLoc.lat
                : null;
          const lng =
            typeof m.lng === "number" && Number.isFinite(m.lng)
              ? m.lng
              : typeof instLoc?.lng === "number" && Number.isFinite(instLoc.lng)
                ? instLoc.lng
                : null;
          const upserted = await upsertDealMilestoneEvent({
            tenantId,
            actorUserId: userId,
            dealId,
            accountId: account.id,
            installationId: createdInstallations[0]?.id ?? null,
            kind: m.kind,
            title: m.title,
            label: m.label,
            startAt: range.startAt,
            endAt: range.endAt,
            allDay: range.allDay,
            notes: m.notes,
            customAddress: address,
            lat,
            lng,
            participantIds: m.participantIds,
            externalEmails: m.externalEmails,
          });
          milestoneResults.push({
            kind: m.kind,
            eventId: upserted.eventId,
            syncStatus: upserted.syncStatus,
            action: upserted.action,
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

  // Cleanup: cancelar banda all-day legacy si existía. Los hitos (entrega,
  // consultas, visita) ya se sincronizan como Agenda del negocio arriba.
  if (dealId) {
    try {
      const { syncLicitacionToCalendar } = await import("@/modules/agenda/agenda-sync");
      await syncLicitacionToCalendar(tenantId, dealId, "delete", {
        actorUserId: userId,
      });
    } catch (e) {
      console.warn("[email-to-crm-structure] cancel banda licitación legacy:", e);
    }
    const syncedMilestone = milestoneResults.find((m) => m.syncStatus === "SYNCED");
    const pendingMilestone = milestoneResults.find((m) => m.syncStatus === "PENDING");
    if (syncedMilestone) {
      agendaSync = { attempted: true, ok: true, syncStatus: "SYNCED" };
    } else if (pendingMilestone) {
      agendaSync = {
        attempted: true,
        ok: false,
        syncStatus: "PENDING",
        skippedReason: "pendiente",
      };
    } else if (milestoneResults.length > 0) {
      agendaSync = {
        attempted: true,
        ok: false,
        syncStatus: "ERROR",
        skippedReason: "error",
      };
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

  const reusedInstCount = createdInstallations.filter((i) => i.reused).length;
  const noteParts = [
    `Estructura: ${accountReused ? "cuenta actualizada" : "cuenta nueva"}`,
    contactId
      ? contactReused
        ? "contacto actualizado"
        : "contacto nuevo"
      : null,
    dealId
      ? dealReused || thread.dealId === dealId
        ? "negocio actualizado"
        : "negocio nuevo"
      : "sin negocio",
    flags.installations
      ? reusedInstCount > 0
        ? `${createdInstallations.length} instalación(es) (${reusedInstCount} actualizada(s))`
        : `${createdInstallations.length} instalación(es)`
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
    contactReused: contactReused || undefined,
    dealId,
    dealUrl,
    dealReused: dealReused || undefined,
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
