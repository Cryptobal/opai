import { dateAtChileSlot } from "@/components/agenda/agenda-calendar-utils";
import { prisma } from "@/lib/prisma";
import {
  createOpaiEvent,
  updateOpaiEvent,
  type OpaiEventInput,
} from "@/modules/calendar/calendar-write";
import type { PlanMilestone } from "@/modules/crm/email/email-to-crm-structure.types";

const MILESTONE_TITLES: Partial<Record<PlanMilestone["kind"], string>> = {
  consultas: "Cierre de consultas",
  visita_tecnica: "Visita técnica",
  entrega_bases: "Entrega de bases",
  entrega: "Entrega de la oferta",
};

export const MILESTONE_LABELS: Partial<Record<PlanMilestone["kind"], string>> = {
  consultas: "Consultas",
  visita_tecnica: "Visita técnica",
  entrega_bases: "Entrega de bases",
  entrega: "Entrega de oferta",
};

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
    MILESTONE_TITLES[params.kind] ||
    params.label?.trim() ||
    "Evento";
  const label = params.label?.trim() || MILESTONE_LABELS[params.kind] || null;
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
        : `Hito: ${MILESTONE_LABELS[params.kind] ?? params.kind}`),
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
  const label = MILESTONE_LABELS[params.kind];
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
      MILESTONE_TITLES[params.kind] ||
      params.label?.trim() ||
      "Evento";
    const label = params.label?.trim() || MILESTONE_LABELS[params.kind] || null;
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
            : `Hito: ${MILESTONE_LABELS[params.kind] ?? params.kind}`),
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
