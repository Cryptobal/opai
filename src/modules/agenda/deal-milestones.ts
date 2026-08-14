import { dateAtChileSlot } from "@/components/agenda/agenda-calendar-utils";
import { ymdInChile } from "@/lib/dates-cl";
import { prisma } from "@/lib/prisma";
import {
  createOpaiEvent,
  updateOpaiEvent,
  type OpaiEventInput,
} from "@/modules/calendar/calendar-write";
import type { PlanMilestone } from "@/modules/crm/email/email-to-crm-structure.types";

export const DEAL_MILESTONE_KINDS = [
  "consultas",
  "visita_tecnica",
  "entrega_bases",
  "entrega",
] as const;

export type DealMilestoneKind = (typeof DEAL_MILESTONE_KINDS)[number];

const MILESTONE_TITLES: Record<DealMilestoneKind, string> = {
  consultas: "Cierre de consultas",
  visita_tecnica: "Visita técnica",
  entrega_bases: "Entrega de bases",
  entrega: "Entrega de la oferta",
};

/** Label persistido en AgendaVisita.label — usado para idempotencia. */
export const MILESTONE_LABELS: Record<DealMilestoneKind, string> = {
  consultas: "Consultas",
  visita_tecnica: "Visita técnica",
  entrega_bases: "Entrega de bases",
  entrega: "Entrega de oferta",
};

/** Copy de chips en el negocio (no cambia el plan de correos). */
export const MILESTONE_CHIP_LABELS: Record<DealMilestoneKind, string> = {
  consultas: "Plazo consultas",
  visita_tecnica: "Visita técnica",
  entrega_bases: "Entrega de bases",
  entrega: "Entrega de oferta",
};

export function isDealMilestoneKind(value: string): value is DealMilestoneKind {
  return (DEAL_MILESTONE_KINDS as readonly string[]).includes(value);
}

function persistedTitle(kind: PlanMilestone["kind"]): string | undefined {
  return isDealMilestoneKind(kind) ? MILESTONE_TITLES[kind] : undefined;
}

function persistedLabel(kind: PlanMilestone["kind"]): string | undefined {
  return isDealMilestoneKind(kind) ? MILESTONE_LABELS[kind] : undefined;
}

/**
 * `"00:00"` se trata como ausencia de hora salvo allDay.
 * Pliego que sí indica medianoche debe venir con `allDay: true`.
 */
export function resolveMilestoneTime(
  m: Pick<PlanMilestone, "time" | "allDay">,
): string | null {
  if (m.allDay === true) return null;
  const raw = typeof m.time === "string" ? m.time.trim() : "";
  if (!raw || raw === "00:00") return null;
  if (!/^\d{2}:\d{2}$/.test(raw)) return null;
  return raw;
}

export type CreateAgendaEventWithPeopleParams = {
  tenantId: string;
  actorUserId: string;
  type?: "cliente" | "supervision" | "otra";
  title: string;
  label?: string | null;
  dealId?: string | null;
  accountId?: string | null;
  installationId?: string | null;
  startAt: Date;
  endAt: Date;
  allDay?: boolean;
  notes?: string | null;
  customAddress?: string | null;
  lat?: number | null;
  lng?: number | null;
  participantIds?: string[];
  externalEmails?: Array<{ email: string; name?: string | null }>;
  contactIds?: string[];
  assignedUserId?: string;
  syncGoogle?: boolean;
  notifyOpai?: boolean;
  slackReminderPrevDay?: boolean;
};

/**
 * Envoltorio delgado sobre createOpaiEvent (compat con composer / hitos).
 */
export async function createAgendaEventWithPeople(
  params: CreateAgendaEventWithPeopleParams,
): Promise<{
  visita: {
    id: string;
    title: string;
    type: string;
    assignedUserId: string | null;
    label?: string | null;
  };
  syncStatus: string;
  htmlLink: string | null;
}> {
  const input: OpaiEventInput = {
    tenantId: params.tenantId,
    actorUserId: params.actorUserId,
    type: params.type ?? "otra",
    title: params.title,
    label: params.label ?? null,
    assignedUserId: params.assignedUserId ?? params.actorUserId,
    startAt: params.startAt,
    endAt: params.endAt,
    allDay: params.allDay,
    notes: params.notes ?? null,
    address: params.customAddress ?? null,
    lat: params.lat ?? null,
    lng: params.lng ?? null,
    accountId: params.accountId ?? null,
    installationId: params.installationId ?? null,
    dealId: params.dealId ?? null,
    participantIds: params.participantIds,
    externalEmails: params.externalEmails,
    contactIds: params.contactIds,
    syncGoogle: params.syncGoogle,
    notifyOpai: params.notifyOpai ?? true,
    slackReminderPrevDay: params.slackReminderPrevDay,
  };
  const result = await createOpaiEvent(input);
  return {
    visita: {
      id: result.visita.id,
      title: result.visita.title,
      type: result.visita.type,
      assignedUserId: result.visita.assignedUserId,
      label: result.visita.label,
    },
    syncStatus: result.syncStatus,
    htmlLink: result.htmlLink,
  };
}

export async function createDealMilestoneEvent(params: {
  tenantId: string;
  actorUserId: string;
  dealId: string;
  accountId?: string | null;
  installationId?: string | null;
  kind: PlanMilestone["kind"];
  startAt: Date;
  endAt: Date;
  allDay?: boolean;
  title?: string;
  label?: string;
  notes?: string | null;
  customAddress?: string | null;
  lat?: number | null;
  lng?: number | null;
  participantIds?: string[];
  externalEmails?: Array<{ email: string; name?: string | null }>;
  syncGoogle?: boolean;
}): Promise<{ eventId: string; syncStatus: string; title: string; htmlLink: string | null }> {
  const title =
    params.title?.trim() ||
    persistedTitle(params.kind) ||
    params.label?.trim() ||
    "Evento";
  const label = params.label?.trim() || persistedLabel(params.kind) || null;
  const { visita, syncStatus, htmlLink } = await createAgendaEventWithPeople({
    tenantId: params.tenantId,
    actorUserId: params.actorUserId,
    type: "otra",
    title,
    label,
    dealId: params.dealId,
    accountId: params.accountId,
    installationId: params.installationId,
    startAt: params.startAt,
    endAt: params.endAt,
    allDay: params.allDay,
    notes:
      params.notes ??
      (params.kind === "otro"
        ? null
        : `Hito: ${persistedLabel(params.kind) ?? params.kind}`),
    customAddress: params.customAddress ?? null,
    lat: params.lat ?? null,
    lng: params.lng ?? null,
    participantIds: params.participantIds,
    externalEmails: params.externalEmails,
    syncGoogle: params.syncGoogle,
    notifyOpai: true,
  });
  return { eventId: visita.id, syncStatus, title, htmlLink };
}

/** Construye start/end en TZ Chile desde date+time del plan. */
export function milestoneRangeFromPlan(m: PlanMilestone): {
  startAt: Date;
  endAt: Date;
  allDay: boolean;
} | null {
  if (!/^\d{4}-\d{2}-\d{2}$/.test(m.date)) return null;
  const allDay = m.allDay === true;
  if (allDay) {
    return {
      startAt: dateAtChileSlot(m.date, 0),
      endAt: dateAtChileSlot(m.date, 24 * 60 - 1),
      allDay: true,
    };
  }
  const time = resolveMilestoneTime(m) ?? "09:00";
  const [hh, mm] = time.split(":").map(Number);
  if (Number.isNaN(hh) || Number.isNaN(mm)) return null;
  const durationMin = Math.max(15, Math.min(24 * 60, Number(m.durationMin) || 60));
  const startAt = dateAtChileSlot(m.date, hh * 60 + mm);
  const endAt = new Date(startAt.getTime() + durationMin * 60_000);
  return { startAt, endAt, allDay: false };
}

/** Busca visita de hito existente (no cancelada) por deal + label canónico. */
export async function findExistingDealMilestone(params: {
  tenantId: string;
  dealId: string;
  kind: PlanMilestone["kind"];
}): Promise<{ id: string } | null> {
  const label = persistedLabel(params.kind);
  if (!label) return null;
  return prisma.agendaVisita.findFirst({
    where: {
      tenantId: params.tenantId,
      dealId: params.dealId,
      label,
      status: { not: "cancelada" },
    },
    select: { id: true },
    orderBy: { startAt: "asc" },
  });
}

/** Crea o actualiza el hito del negocio (idempotente por dealId + label). */
export async function upsertDealMilestoneEvent(params: {
  tenantId: string;
  actorUserId: string;
  dealId: string;
  accountId?: string | null;
  installationId?: string | null;
  kind: PlanMilestone["kind"];
  startAt: Date;
  endAt: Date;
  allDay?: boolean;
  title?: string;
  label?: string;
  notes?: string | null;
  customAddress?: string | null;
  lat?: number | null;
  lng?: number | null;
  participantIds?: string[];
  externalEmails?: Array<{ email: string; name?: string | null }>;
  syncGoogle?: boolean;
}): Promise<{
  eventId: string;
  syncStatus: string;
  title: string;
  htmlLink: string | null;
  action: "creado" | "actualizado";
}> {
  const existing = await findExistingDealMilestone({
    tenantId: params.tenantId,
    dealId: params.dealId,
    kind: params.kind,
  });

  if (existing) {
    const title =
      params.title?.trim() ||
      persistedTitle(params.kind) ||
      params.label?.trim() ||
      "Evento";
    const label = params.label?.trim() || persistedLabel(params.kind) || null;
    const updated = await updateOpaiEvent(
      params.tenantId,
      existing.id,
      {
        title,
        label,
        startAt: params.startAt,
        endAt: params.endAt,
        allDay: params.allDay,
        notes:
          params.notes ??
          (params.kind === "otro"
            ? null
            : `Hito: ${persistedLabel(params.kind) ?? params.kind}`),
        address: params.customAddress ?? null,
        lat: params.lat ?? null,
        lng: params.lng ?? null,
        accountId: params.accountId ?? null,
        installationId: params.installationId ?? null,
        dealId: params.dealId,
        participantIds: params.participantIds,
        externalEmails: params.externalEmails,
        syncGoogle: params.syncGoogle,
      },
      params.actorUserId,
    );
    return {
      eventId: existing.id,
      syncStatus: updated?.syncStatus ?? "ERROR",
      title,
      htmlLink: updated?.htmlLink ?? null,
      action: "actualizado",
    };
  }

  const created = await createDealMilestoneEvent(params);
  return { ...created, action: "creado" };
}

export type DealMilestoneRow = {
  kind: DealMilestoneKind;
  chipLabel: string;
  eventId: string | null;
  date: string | null;
  assignedName: string | null;
  inviteeCount: number;
  syncStatus: string | null;
  htmlLink: string | null;
  participantIds: string[];
  externalEmails: Array<{ email: string; name?: string | null }>;
};

/** Lista los 4 hitos canónicos del negocio (pendientes incluidos). */
export async function listDealMilestones(
  tenantId: string,
  dealId: string,
): Promise<DealMilestoneRow[]> {
  const labels = DEAL_MILESTONE_KINDS.map((k) => MILESTONE_LABELS[k]);
  const visitas = await prisma.agendaVisita.findMany({
    where: {
      tenantId,
      dealId,
      label: { in: labels },
      status: { not: "cancelada" },
    },
    select: {
      id: true,
      label: true,
      startAt: true,
      assignedUserId: true,
    },
    orderBy: { startAt: "asc" },
  });

  const byLabel = new Map<string, (typeof visitas)[number]>();
  for (const v of visitas) {
    if (v.label && !byLabel.has(v.label)) byLabel.set(v.label, v);
  }

  const eventIds = visitas.map((v) => v.id);
  const assignedIds = [...new Set(visitas.map((v) => v.assignedUserId).filter(Boolean))];

  const [admins, participants, externals, providerLinks, legacyLinks] = await Promise.all([
    assignedIds.length
      ? prisma.admin.findMany({
          where: { tenantId, id: { in: assignedIds } },
          select: { id: true, name: true },
        })
      : Promise.resolve([]),
    eventIds.length
      ? prisma.calendarEventParticipant.findMany({
          where: { tenantId, eventId: { in: eventIds } },
          select: { eventId: true, userId: true },
        })
      : Promise.resolve([]),
    eventIds.length
      ? prisma.calendarExternalAttendee.findMany({
          where: { tenantId, eventId: { in: eventIds } },
          select: { eventId: true, email: true, name: true },
        })
      : Promise.resolve([]),
    eventIds.length
      ? prisma.calendarProviderLink.findMany({
          where: {
            tenantId,
            provider: "google",
            role: "organizer",
            eventId: { in: eventIds },
          },
          select: { eventId: true, htmlLink: true, syncStatus: true },
        })
      : Promise.resolve([]),
    eventIds.length
      ? prisma.agendaEventLink.findMany({
          where: {
            tenantId,
            sourceType: "agenda_visita",
            sourceId: { in: eventIds },
          },
          select: { sourceId: true, htmlLink: true, syncStatus: true },
        })
      : Promise.resolve([]),
  ]);

  const nameById = new Map(admins.map((a) => [a.id, a.name]));
  const partsByEvent = new Map<string, string[]>();
  for (const p of participants) {
    const list = partsByEvent.get(p.eventId) ?? [];
    list.push(p.userId);
    partsByEvent.set(p.eventId, list);
  }
  const extByEvent = new Map<string, Array<{ email: string; name?: string | null }>>();
  for (const e of externals) {
    const list = extByEvent.get(e.eventId) ?? [];
    list.push({ email: e.email, name: e.name });
    extByEvent.set(e.eventId, list);
  }
  const syncByEvent = new Map<string, { syncStatus: string | null; htmlLink: string | null }>();
  for (const l of legacyLinks) {
    syncByEvent.set(l.sourceId, { syncStatus: l.syncStatus, htmlLink: l.htmlLink });
  }
  for (const l of providerLinks) {
    const prev = syncByEvent.get(l.eventId);
    syncByEvent.set(l.eventId, {
      syncStatus: l.syncStatus ?? prev?.syncStatus ?? null,
      htmlLink: l.htmlLink ?? prev?.htmlLink ?? null,
    });
  }

  return DEAL_MILESTONE_KINDS.map((kind) => {
    const visita = byLabel.get(MILESTONE_LABELS[kind]) ?? null;
    const participantIds = visita ? (partsByEvent.get(visita.id) ?? []) : [];
    const externalEmails = visita ? (extByEvent.get(visita.id) ?? []) : [];
    const extras = participantIds.filter((id) => id !== visita?.assignedUserId).length;
    const sync = visita ? syncByEvent.get(visita.id) : undefined;
    return {
      kind,
      chipLabel: MILESTONE_CHIP_LABELS[kind],
      eventId: visita?.id ?? null,
      date: visita ? ymdInChile(visita.startAt) : null,
      assignedName: visita ? (nameById.get(visita.assignedUserId) ?? null) : null,
      inviteeCount: extras + externalEmails.length,
      syncStatus: sync?.syncStatus ?? null,
      htmlLink: sync?.htmlLink ?? null,
      participantIds,
      externalEmails,
    };
  });
}
