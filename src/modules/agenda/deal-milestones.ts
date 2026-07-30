import { prisma } from "@/lib/prisma";
import { dateAtChileSlot } from "@/components/agenda/agenda-calendar-utils";
import { createAgendaVisita } from "@/modules/agenda/agenda.service";
import { isCalendarV2Enabled } from "@/modules/calendar/calendar-flags";
import type { PlanMilestone } from "@/modules/crm/email/email-to-crm-structure.types";

const MILESTONE_TITLES: Record<PlanMilestone["kind"], string> = {
  consultas: "Cierre de consultas",
  visita_tecnica: "Visita técnica",
  entrega: "Entrega de la oferta",
};

export type CreateAgendaEventWithPeopleParams = {
  tenantId: string;
  actorUserId: string;
  type?: "cliente" | "supervision" | "otra";
  title: string;
  dealId?: string | null;
  accountId?: string | null;
  installationId?: string | null;
  startAt: Date;
  endAt: Date;
  allDay?: boolean;
  notes?: string | null;
  customAddress?: string | null;
  participantIds?: string[];
  externalEmails?: Array<{ email: string; name?: string | null }>;
  syncGoogle?: boolean;
  notifyOpai?: boolean;
};

/**
 * Crea AgendaVisita + participantes internos/externos + sync Google (un solo camino).
 * Usado por POST /api/calendar/events y por hitos del Plan de acciones.
 */
export async function createAgendaEventWithPeople(
  params: CreateAgendaEventWithPeopleParams,
): Promise<{ visita: { id: string; title: string; type: string; assignedUserId: string | null }; syncStatus: string }> {
  const {
    tenantId,
    actorUserId,
    type = "otra",
    title,
    dealId,
    accountId,
    installationId,
    startAt,
    endAt,
    allDay = false,
    notes,
    customAddress,
    syncGoogle = true,
    notifyOpai = true,
  } = params;

  const rawIds = Array.isArray(params.participantIds) ? params.participantIds : [];
  const validAdmins =
    rawIds.length > 0
      ? await prisma.admin.findMany({
          where: { tenantId, id: { in: rawIds }, status: "active" },
          select: { id: true },
        })
      : [];
  const participantIds = validAdmins.map((a) => a.id);

  const externals = (params.externalEmails ?? [])
    .filter((e) => typeof e?.email === "string" && e.email.includes("@"))
    .slice(0, 20)
    .map((e) => ({ email: e.email.trim().toLowerCase(), name: e.name ?? null }));

  const v2 = isCalendarV2Enabled();
  const hasPeople = participantIds.length > 0 || externals.length > 0;
  const useV2Sync = v2 && hasPeople;

  const { visita } = await createAgendaVisita({
    tenantId,
    createdBy: actorUserId,
    type,
    title,
    accountId: accountId ?? null,
    installationId: installationId ?? null,
    dealId: dealId || null,
    assignedUserId: actorUserId,
    startAt,
    endAt,
    allDay,
    notes: notes ?? null,
    customAddress: customAddress ?? null,
    syncCalendar: syncGoogle && !useV2Sync,
    inviteContacts: false,
  });

  let syncStatus = "SKIPPED";
  if (v2) {
    const extras = participantIds.filter((id) => id !== visita.assignedUserId);
    const { addEventParticipants } = await import(
      "@/modules/calendar/calendar-participants"
    );
    await addEventParticipants(
      tenantId,
      visita.id,
      extras.map((userId) => ({ userId, role: "required" as const })),
      actorUserId,
    );
    for (const ext of externals) {
      await prisma.calendarExternalAttendee.upsert({
        where: { eventId_email: { eventId: visita.id, email: ext.email } },
        create: {
          tenantId,
          eventId: visita.id,
          email: ext.email,
          name: ext.name,
        },
        update: { name: ext.name },
      });
    }

    if (useV2Sync && syncGoogle) {
      const { syncCalendarEventToGoogle } = await import(
        "@/modules/calendar/calendar-google-sync"
      );
      syncStatus = (await syncCalendarEventToGoogle(tenantId, visita.id)).syncStatus;
    }

    if (notifyOpai && extras.length) {
      const { notifyCalendarEvent } = await import("@/modules/calendar/calendar-notify");
      await notifyCalendarEvent({
        tenantId,
        eventId: visita.id,
        kind: "invited",
        actorId: actorUserId,
        targetUserIds: extras,
      }).catch(() => undefined);
    }
  }

  return { visita, syncStatus };
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
  notes?: string | null;
  participantIds?: string[];
  externalEmails?: Array<{ email: string; name?: string | null }>;
  syncGoogle?: boolean;
}): Promise<{ eventId: string; syncStatus: string; title: string }> {
  const title = params.title?.trim() || MILESTONE_TITLES[params.kind];
  const { visita, syncStatus } = await createAgendaEventWithPeople({
    tenantId: params.tenantId,
    actorUserId: params.actorUserId,
    type: "otra",
    title,
    dealId: params.dealId,
    accountId: params.accountId,
    installationId: params.installationId,
    startAt: params.startAt,
    endAt: params.endAt,
    allDay: params.allDay,
    notes: params.notes ?? `Hito licitación: ${params.kind}`,
    participantIds: params.participantIds,
    externalEmails: params.externalEmails,
    syncGoogle: params.syncGoogle,
    notifyOpai: false,
  });
  return { eventId: visita.id, syncStatus, title };
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
  const [hh, mm] = (m.time || "09:00").split(":").map(Number);
  if (Number.isNaN(hh) || Number.isNaN(mm)) return null;
  const durationMin = Math.max(15, Math.min(24 * 60, Number(m.durationMin) || 60));
  const startAt = dateAtChileSlot(m.date, hh * 60 + mm);
  const endAt = new Date(startAt.getTime() + durationMin * 60_000);
  return { startAt, endAt, allDay: false };
}
