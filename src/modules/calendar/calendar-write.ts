/**
 * Servicio único de escritura de eventos OPAI.
 * Todas las superficies (negocio, copiloto, agenda) delegan aquí.
 *
 * Orden: validar tenant → AgendaVisita → mirror CalendarEvent → participantes
 * → externos → sync Google → audit/notify. Un fallo de Google NUNCA revierte lo local.
 */
import { prisma } from "@/lib/prisma";
import { mirrorVisitaToV2 } from "./calendar-mapper";
import {
  addEventParticipants,
  removeEventParticipant,
  setEventOwner,
} from "./calendar-participants";
import { syncCalendarEventToGoogle } from "./calendar-google-sync";
import { recordCalendarAudit } from "./calendar-audit";
import { notifyCalendarEvent } from "./calendar-notify";
import { labelToKindSlug } from "./calendar-label";

export { labelToKindSlug } from "./calendar-label";

export class OpaiEventValidationError extends Error {
  status = 400 as const;
  constructor(message: string) {
    super(message);
    this.name = "OpaiEventValidationError";
  }
}

export type OpaiEventInput = {
  tenantId: string;
  actorUserId: string;
  title: string;
  label?: string | null;
  /** Legacy color/filtro; default "otra" para etiquetas libres. */
  type?: "cliente" | "supervision" | "otra";
  assignedUserId: string;
  startAt: Date;
  endAt: Date;
  allDay?: boolean;
  address?: string | null;
  lat?: number | null;
  lng?: number | null;
  notes?: string | null;
  accountId?: string | null;
  installationId?: string | null;
  dealId?: string | null;
  participantIds?: string[];
  externalEmails?: Array<{ email: string; name?: string | null }>;
  contactIds?: string[];
  syncGoogle?: boolean;
  notifyOpai?: boolean;
  /** Recordatorio Slack día anterior (minutesBefore: 1440). */
  slackReminderPrevDay?: boolean;
};

export type OpaiEventResult = {
  eventId: string;
  syncStatus: string;
  htmlLink: string | null;
  visita: {
    id: string;
    title: string;
    type: string;
    label: string | null;
    assignedUserId: string;
    dealId: string | null;
    status: string;
  };
};

const EMAIL_RE = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
const MAX_EXTERNALS = 50;
const MAX_TITLE = 200;
const MAX_NOTES = 5000;
const MAX_ADDRESS = 500;
const MAX_LABEL = 80;

function sanitizeText(value: string | null | undefined, max: number): string | null {
  if (value == null) return null;
  const t = String(value).replace(/<[^>]*>/g, "").trim();
  if (!t) return null;
  return t.slice(0, max);
}

async function assertTenantRefs(input: {
  tenantId: string;
  assignedUserId: string;
  accountId?: string | null;
  installationId?: string | null;
  dealId?: string | null;
  participantIds: string[];
  contactIds: string[];
}): Promise<{
  participantIds: string[];
  contactExternals: Array<{ email: string; name: string | null; crmContactId: string }>;
}> {
  const { tenantId } = input;

  const assignee = await prisma.admin.findFirst({
    where: { id: input.assignedUserId, tenantId, status: "active" },
    select: { id: true },
  });
  if (!assignee) {
    throw new OpaiEventValidationError("Responsable no pertenece al tenant");
  }

  if (input.accountId) {
    const acc = await prisma.crmAccount.findFirst({
      where: { id: input.accountId, tenantId },
      select: { id: true },
    });
    if (!acc) throw new OpaiEventValidationError("Cuenta no pertenece al tenant");
  }

  if (input.installationId) {
    const inst = await prisma.crmInstallation.findFirst({
      where: { id: input.installationId, tenantId },
      select: { id: true, accountId: true },
    });
    if (!inst) throw new OpaiEventValidationError("Instalación no pertenece al tenant");
    if (input.accountId && inst.accountId !== input.accountId) {
      throw new OpaiEventValidationError("Instalación no pertenece a la cuenta");
    }
  }

  if (input.dealId) {
    const deal = await prisma.crmDeal.findFirst({
      where: { id: input.dealId, tenantId },
      select: { id: true, accountId: true },
    });
    if (!deal) throw new OpaiEventValidationError("Negocio no pertenece al tenant");
    if (input.accountId && deal.accountId !== input.accountId) {
      throw new OpaiEventValidationError("Negocio no pertenece a la cuenta");
    }
  }

  const rawParticipantIds = [...new Set(input.participantIds.filter(Boolean))];
  let participantIds: string[] = [];
  if (rawParticipantIds.length) {
    const admins = await prisma.admin.findMany({
      where: { tenantId, id: { in: rawParticipantIds }, status: "active" },
      select: { id: true },
    });
    if (admins.length !== rawParticipantIds.length) {
      throw new OpaiEventValidationError("Participante no pertenece al tenant");
    }
    participantIds = admins.map((a) => a.id);
  }

  const contactExternals: Array<{
    email: string;
    name: string | null;
    crmContactId: string;
  }> = [];
  if (input.contactIds.length) {
    const contacts = await prisma.crmContact.findMany({
      where: { tenantId, id: { in: input.contactIds } },
      select: { id: true, email: true, firstName: true, lastName: true },
    });
    if (contacts.length !== input.contactIds.length) {
      throw new OpaiEventValidationError("Contacto no pertenece al tenant");
    }
    for (const c of contacts) {
      if (!c.email || !EMAIL_RE.test(c.email)) continue;
      contactExternals.push({
        email: c.email.trim().toLowerCase(),
        name: `${c.firstName} ${c.lastName}`.trim() || null,
        crmContactId: c.id,
      });
    }
  }

  return { participantIds, contactExternals };
}

function normalizeExternals(
  raw: Array<{ email: string; name?: string | null }>,
  fromContacts: Array<{ email: string; name: string | null; crmContactId: string }>,
  internalEmails: Set<string>,
): Array<{ email: string; name: string | null; crmContactId?: string | null }> {
  const map = new Map<
    string,
    { email: string; name: string | null; crmContactId?: string | null }
  >();
  for (const c of fromContacts) {
    if (internalEmails.has(c.email)) continue;
    map.set(c.email, c);
  }
  for (const e of raw) {
    const email = String(e.email ?? "")
      .trim()
      .toLowerCase();
    if (!EMAIL_RE.test(email) || internalEmails.has(email)) continue;
    const name = sanitizeText(e.name ?? null, 120);
    const prev = map.get(email);
    map.set(email, {
      email,
      name: name ?? prev?.name ?? null,
      crmContactId: prev?.crmContactId ?? null,
    });
  }
  return [...map.values()].slice(0, MAX_EXTERNALS);
}

async function resolveHtmlLink(
  tenantId: string,
  eventId: string,
): Promise<string | null> {
  const link = await prisma.calendarProviderLink.findFirst({
    where: {
      tenantId,
      eventId,
      provider: "google",
      role: "organizer",
      htmlLink: { not: null },
    },
    select: { htmlLink: true },
  });
  if (link?.htmlLink) return link.htmlLink;
  const legacy = await prisma.agendaEventLink.findUnique({
    where: {
      sourceType_sourceId: { sourceType: "agenda_visita", sourceId: eventId },
    },
    select: { htmlLink: true },
  });
  return legacy?.htmlLink ?? null;
}

async function upsertSlackReminder(
  tenantId: string,
  eventId: string,
  enabled: boolean,
): Promise<void> {
  const existing = await prisma.calendarEventReminder.findMany({
    where: { tenantId, eventId, method: "slack", minutesBefore: 1440 },
    select: { id: true },
  });
  if (enabled) {
    if (existing.length === 0) {
      await prisma.calendarEventReminder.create({
        data: { tenantId, eventId, method: "slack", minutesBefore: 1440 },
      });
    }
  } else if (existing.length) {
    await prisma.calendarEventReminder.deleteMany({
      where: { id: { in: existing.map((r) => r.id) } },
    });
  }
}

export async function createOpaiEvent(input: OpaiEventInput): Promise<OpaiEventResult> {
  const title = sanitizeText(input.title, MAX_TITLE);
  if (!title) throw new OpaiEventValidationError("Título obligatorio");

  const label = sanitizeText(input.label ?? null, MAX_LABEL);
  const notes = sanitizeText(input.notes ?? null, MAX_NOTES);
  const address = sanitizeText(input.address ?? null, MAX_ADDRESS);
  const type = input.type ?? "otra";
  const allDay = input.allDay === true;
  const syncGoogle = input.syncGoogle !== false;
  const notifyOpai = input.notifyOpai !== false;

  const contactIds = Array.isArray(input.contactIds)
    ? [...new Set(input.contactIds.filter((id): id is string => typeof id === "string"))]
    : [];

  const { participantIds, contactExternals } = await assertTenantRefs({
    tenantId: input.tenantId,
    assignedUserId: input.assignedUserId,
    accountId: input.accountId,
    installationId: input.installationId,
    dealId: input.dealId,
    participantIds: Array.isArray(input.participantIds) ? input.participantIds : [],
    contactIds,
  });

  // Emails de internos (para dedupe externo).
  const internalAdmins = await prisma.admin.findMany({
    where: {
      tenantId: input.tenantId,
      id: { in: [...new Set([input.assignedUserId, ...participantIds])] },
    },
    select: { id: true, email: true },
  });
  const internalEmails = new Set(
    internalAdmins
      .map((a) => a.email?.trim().toLowerCase())
      .filter((e): e is string => Boolean(e)),
  );

  const externals = normalizeExternals(
    input.externalEmails ?? [],
    contactExternals,
    internalEmails,
  );

  const visita = await prisma.agendaVisita.create({
    data: {
      tenantId: input.tenantId,
      type,
      title,
      label,
      accountId: input.accountId ?? null,
      installationId: input.installationId ?? null,
      dealId: input.dealId ?? null,
      assignedUserId: input.assignedUserId,
      startAt: input.startAt,
      endAt: input.endAt,
      allDay,
      notes,
      customAddress: address,
      lat: typeof input.lat === "number" ? input.lat : null,
      lng: typeof input.lng === "number" ? input.lng : null,
      contactIds: contactIds.length ? contactIds : undefined,
      createdBy: input.actorUserId,
      status: "programada",
    },
  });

  await mirrorVisitaToV2(visita, input.actorUserId, { allDay });

  // Propagar kind desde etiqueta (slug) cuando hay label.
  if (label) {
    await prisma.calendarEvent.updateMany({
      where: { id: visita.id, tenantId: input.tenantId },
      data: { kind: labelToKindSlug(label) },
    });
  }

  const extras = participantIds.filter((id) => id !== input.assignedUserId);
  if (extras.length) {
    await addEventParticipants(
      input.tenantId,
      visita.id,
      extras.map((userId) => ({ userId, role: "required" as const })),
      input.actorUserId,
    );
  }

  for (const ext of externals) {
    await prisma.calendarExternalAttendee.upsert({
      where: { eventId_email: { eventId: visita.id, email: ext.email } },
      create: {
        tenantId: input.tenantId,
        eventId: visita.id,
        email: ext.email,
        name: ext.name,
        crmContactId: ext.crmContactId ?? null,
      },
      update: { name: ext.name, crmContactId: ext.crmContactId ?? null },
    });
  }

  if (input.slackReminderPrevDay === true) {
    await upsertSlackReminder(input.tenantId, visita.id, true);
  }

  let syncStatus = "SKIPPED";
  if (syncGoogle) {
    syncStatus = (await syncCalendarEventToGoogle(input.tenantId, visita.id)).syncStatus;
  }

  if (notifyOpai && extras.length) {
    await notifyCalendarEvent({
      tenantId: input.tenantId,
      eventId: visita.id,
      kind: "invited",
      actorId: input.actorUserId,
      targetUserIds: extras,
    }).catch(() => undefined);
  }

  await recordCalendarAudit({
    tenantId: input.tenantId,
    eventId: visita.id,
    actorId: input.actorUserId,
    action: "created",
    payload: { title, label, via: "createOpaiEvent" },
  });

  const htmlLink = await resolveHtmlLink(input.tenantId, visita.id);
  return {
    eventId: visita.id,
    syncStatus,
    htmlLink,
    visita: {
      id: visita.id,
      title: visita.title,
      type: visita.type,
      label: visita.label,
      assignedUserId: visita.assignedUserId,
      dealId: visita.dealId,
      status: visita.status,
    },
  };
}

export async function updateOpaiEvent(
  tenantId: string,
  eventId: string,
  patch: Partial<OpaiEventInput>,
  actorUserId: string,
): Promise<OpaiEventResult | null> {
  const existing = await prisma.agendaVisita.findFirst({
    where: { id: eventId, tenantId },
  });
  if (!existing) return null;

  const nextAssigned = patch.assignedUserId ?? existing.assignedUserId;
  const nextAccountId =
    patch.accountId !== undefined ? patch.accountId : existing.accountId;
  const nextInstallationId =
    patch.installationId !== undefined ? patch.installationId : existing.installationId;
  const nextDealId = patch.dealId !== undefined ? patch.dealId : existing.dealId;

  const wantsPeople =
    patch.participantIds !== undefined ||
    patch.externalEmails !== undefined ||
    patch.contactIds !== undefined;

  const contactIds = Array.isArray(patch.contactIds)
    ? [...new Set(patch.contactIds.filter((id): id is string => typeof id === "string"))]
    : Array.isArray(existing.contactIds)
      ? (existing.contactIds as string[])
      : [];

  const { participantIds, contactExternals } = await assertTenantRefs({
    tenantId,
    assignedUserId: nextAssigned,
    accountId: nextAccountId,
    installationId: nextInstallationId,
    dealId: nextDealId,
    participantIds:
      patch.participantIds !== undefined
        ? patch.participantIds
        : (
            await prisma.calendarEventParticipant.findMany({
              where: { tenantId, eventId, role: { in: ["required", "optional", "watcher"] } },
              select: { userId: true },
            })
          ).map((p) => p.userId),
    contactIds: wantsPeople || patch.contactIds !== undefined ? contactIds : [],
  });

  const title =
    patch.title !== undefined
      ? sanitizeText(patch.title, MAX_TITLE)
      : existing.title;
  if (!title) throw new OpaiEventValidationError("Título obligatorio");

  const label =
    patch.label !== undefined
      ? sanitizeText(patch.label, MAX_LABEL)
      : existing.label;
  const notes =
    patch.notes !== undefined
      ? sanitizeText(patch.notes, MAX_NOTES)
      : existing.notes;
  const address =
    patch.address !== undefined
      ? sanitizeText(patch.address, MAX_ADDRESS)
      : existing.customAddress;
  const allDay = patch.allDay !== undefined ? patch.allDay === true : existing.allDay;
  const startAt = patch.startAt ?? existing.startAt;
  const endAt = patch.endAt ?? existing.endAt;
  const lat =
    patch.lat !== undefined
      ? typeof patch.lat === "number"
        ? patch.lat
        : null
      : existing.lat;
  const lng =
    patch.lng !== undefined
      ? typeof patch.lng === "number"
        ? patch.lng
        : null
      : existing.lng;

  const visita = await prisma.agendaVisita.update({
    where: { id: eventId },
    data: {
      title,
      label,
      type: patch.type ?? existing.type,
      assignedUserId: nextAssigned,
      accountId: nextAccountId ?? null,
      installationId: nextInstallationId ?? null,
      dealId: nextDealId ?? null,
      startAt,
      endAt,
      allDay,
      notes,
      customAddress: address,
      lat,
      lng,
      ...(patch.contactIds !== undefined
        ? { contactIds: contactIds.length ? contactIds : [] }
        : {}),
      status: existing.status === "programada" ? "reprogramada" : existing.status,
    },
  });

  await mirrorVisitaToV2(visita, actorUserId, { allDay });

  if (label) {
    await prisma.calendarEvent.updateMany({
      where: { id: eventId, tenantId },
      data: { kind: labelToKindSlug(label) },
    });
  }

  if (nextAssigned !== existing.assignedUserId) {
    await setEventOwner(tenantId, eventId, nextAssigned, actorUserId);
  }

  // Diff de participantes internos.
  if (patch.participantIds !== undefined) {
    const desired = new Set(
      [...participantIds, nextAssigned].filter(Boolean),
    );
    const current = await prisma.calendarEventParticipant.findMany({
      where: { tenantId, eventId },
      select: { userId: true, role: true },
    });
    const currentIds = new Set(current.map((p) => p.userId));
    const toAdd = [...desired].filter((id) => !currentIds.has(id));
    const toRemove = current.filter(
      (p) => !desired.has(p.userId) && p.role !== "organizer",
    );
    if (toAdd.length) {
      await addEventParticipants(
        tenantId,
        eventId,
        toAdd.map((userId) => ({
          userId,
          role: userId === nextAssigned ? ("owner" as const) : ("required" as const),
        })),
        actorUserId,
      );
    }
    for (const p of toRemove) {
      await removeEventParticipant(tenantId, eventId, p.userId, actorUserId);
    }
    if (toAdd.length && patch.notifyOpai !== false) {
      await notifyCalendarEvent({
        tenantId,
        eventId,
        kind: "invited",
        actorId: actorUserId,
        targetUserIds: toAdd.filter((id) => id !== actorUserId),
      }).catch(() => undefined);
    }
  }

  // Diff de externos.
  if (patch.externalEmails !== undefined || patch.contactIds !== undefined) {
    const internalAdmins = await prisma.admin.findMany({
      where: {
        tenantId,
        id: {
          in: [
            ...new Set([
              nextAssigned,
              ...(patch.participantIds ?? participantIds),
            ]),
          ],
        },
      },
      select: { email: true },
    });
    const internalEmails = new Set(
      internalAdmins
        .map((a) => a.email?.trim().toLowerCase())
        .filter((e): e is string => Boolean(e)),
    );
    const desired = normalizeExternals(
      patch.externalEmails ??
        (
          await prisma.calendarExternalAttendee.findMany({
            where: { tenantId, eventId },
            select: { email: true, name: true },
          })
        ).map((e) => ({ email: e.email, name: e.name })),
      contactExternals,
      internalEmails,
    );
    const desiredEmails = new Set(desired.map((e) => e.email));
    const currentExt = await prisma.calendarExternalAttendee.findMany({
      where: { tenantId, eventId },
      select: { email: true },
    });
    const removeEmails = currentExt
      .map((e) => e.email)
      .filter((email) => !desiredEmails.has(email));
    if (removeEmails.length) {
      await prisma.calendarExternalAttendee.deleteMany({
        where: { tenantId, eventId, email: { in: removeEmails } },
      });
    }
    for (const ext of desired) {
      await prisma.calendarExternalAttendee.upsert({
        where: { eventId_email: { eventId, email: ext.email } },
        create: {
          tenantId,
          eventId,
          email: ext.email,
          name: ext.name,
          crmContactId: ext.crmContactId ?? null,
        },
        update: { name: ext.name, crmContactId: ext.crmContactId ?? null },
      });
    }
  }

  if (patch.slackReminderPrevDay !== undefined) {
    await upsertSlackReminder(tenantId, eventId, patch.slackReminderPrevDay === true);
  }

  let syncStatus = "SKIPPED";
  if (patch.syncGoogle !== false) {
    syncStatus = (await syncCalendarEventToGoogle(tenantId, eventId)).syncStatus;
  }

  await recordCalendarAudit({
    tenantId,
    eventId,
    actorId: actorUserId,
    action: "updated",
    payload: { via: "updateOpaiEvent", fields: Object.keys(patch) },
  });

  const htmlLink = await resolveHtmlLink(tenantId, eventId);
  return {
    eventId,
    syncStatus,
    htmlLink,
    visita: {
      id: visita.id,
      title: visita.title,
      type: visita.type,
      label: visita.label,
      assignedUserId: visita.assignedUserId,
      dealId: visita.dealId,
      status: visita.status,
    },
  };
}

export async function cancelOpaiEvent(
  tenantId: string,
  eventId: string,
  actorUserId: string,
): Promise<OpaiEventResult | null> {
  const existing = await prisma.agendaVisita.findFirst({
    where: { id: eventId, tenantId },
  });
  if (!existing) return null;

  const visita = await prisma.agendaVisita.update({
    where: { id: eventId },
    data: { status: "cancelada" },
  });
  await mirrorVisitaToV2(visita, actorUserId);
  const syncStatus = (await syncCalendarEventToGoogle(tenantId, eventId)).syncStatus;

  await notifyCalendarEvent({
    tenantId,
    eventId,
    kind: "cancelled",
    actorId: actorUserId,
  }).catch(() => undefined);

  await recordCalendarAudit({
    tenantId,
    eventId,
    actorId: actorUserId,
    action: "cancelled",
    payload: { via: "cancelOpaiEvent" },
  });

  return {
    eventId,
    syncStatus,
    htmlLink: null,
    visita: {
      id: visita.id,
      title: visita.title,
      type: visita.type,
      label: visita.label,
      assignedUserId: visita.assignedUserId,
      dealId: visita.dealId,
      status: visita.status,
    },
  };
}
