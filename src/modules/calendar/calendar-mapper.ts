/**
 * Doble escritura legacy → v2: espeja AgendaVisita como CalendarEvent.
 * Convención: CalendarEvent.id === AgendaVisita.id (ambos uuid) — permite
 * upserts idempotentes sin columna de vínculo adicional.
 */
import { prisma } from "@/lib/prisma";
import { getCanonicalSiteUrl } from "@/lib/emails/site-url";
import { createCalendarEvent } from "./calendar.service";
import { setEventOwner } from "./calendar-participants";
import { recordCalendarAudit } from "./calendar-audit";
import { labelToKindSlug } from "./calendar-label";

/** Descripción del espejo v2: notes + deep link a OPAI (patrón legacy). */
export function visitaDescriptionForV2(
  visita: { id: string; notes: string | null },
): string | null {
  const notes = visita.notes?.trim() || null;
  const link = `Ver en OPAI: ${getCanonicalSiteUrl()}/opai/agenda?visita=${visita.id}`;
  return notes ? `${notes}\n\n${link}` : link;
}

export function kindFromVisitaType(type: string, label?: string | null): string {
  if (label?.trim()) return labelToKindSlug(label);
  if (type === "cliente") return "visita_cliente";
  if (type === "supervision") return "supervision";
  if (type === "tecnica") return "visita_tecnica";
  return "event";
}

const STATUS_MAP: Record<string, string> = {
  programada: "confirmed",
  reprogramada: "confirmed",
  completada: "completed",
  cancelada: "cancelled",
};

type VisitaLike = {
  id: string;
  tenantId: string;
  type: string;
  title: string;
  label?: string | null;
  accountId: string | null;
  installationId: string | null;
  dealId: string | null;
  assignedUserId: string;
  startAt: Date;
  endAt: Date;
  allDay?: boolean;
  notes: string | null;
  customAddress: string | null;
  lat: number | null;
  lng: number | null;
  contactIds: unknown;
  status: string;
  createdBy: string;
};

/**
 * Upsert best-effort del espejo v2 de una visita. Nunca lanza: la escritura
 * legacy es la fuente de verdad mientras dure la convivencia.
 */
async function resolveVisitaLocation(visita: VisitaLike): Promise<{
  location: string | null;
  lat: number | null;
  lng: number | null;
}> {
  if (visita.customAddress?.trim()) {
    return {
      location: visita.customAddress.trim(),
      lat: visita.lat,
      lng: visita.lng,
    };
  }
  if (!visita.installationId) {
    return { location: null, lat: visita.lat, lng: visita.lng };
  }
  const inst = await prisma.crmInstallation.findFirst({
    where: { id: visita.installationId, tenantId: visita.tenantId },
    select: { address: true, lat: true, lng: true },
  });
  return {
    location: inst?.address?.trim() || null,
    lat: visita.lat ?? inst?.lat ?? null,
    lng: visita.lng ?? inst?.lng ?? null,
  };
}

export async function mirrorVisitaToV2(
  visita: VisitaLike,
  actorId?: string | null,
  opts?: { allDay?: boolean },
): Promise<void> {
  try {
    const allDay =
      opts?.allDay !== undefined ? opts.allDay === true : visita.allDay === true;
    const loc = await resolveVisitaLocation(visita);
    const existing = await prisma.calendarEvent.findFirst({
      where: { id: visita.id, tenantId: visita.tenantId },
      select: { id: true },
    });

    if (!existing) {
      await createCalendarEvent({
        tenantId: visita.tenantId,
        createdBy: visita.createdBy,
        id: visita.id,
        kind: kindFromVisitaType(visita.type, visita.label),
        title: visita.title,
        description: visitaDescriptionForV2(visita),
        location: loc.location,
        lat: loc.lat,
        lng: loc.lng,
        startAt: visita.startAt,
        endAt: visita.endAt,
        allDay,
        accountId: visita.accountId,
        installationId: visita.installationId,
        dealId: visita.dealId,
        participants: [{ userId: visita.assignedUserId, role: "owner" }],
        externalAttendees: await contactsAsExternals(visita),
      });
      if (visita.status !== "programada") {
        await prisma.calendarEvent.update({
          where: { id: visita.id },
          data: { status: STATUS_MAP[visita.status] ?? "confirmed" },
        });
      }
      return;
    }

    await prisma.calendarEvent.update({
      where: { id: visita.id },
      data: {
        title: visita.title,
        kind: kindFromVisitaType(visita.type, visita.label),
        description: visitaDescriptionForV2(visita),
        location: loc.location,
        lat: loc.lat,
        lng: loc.lng,
        startAt: visita.startAt,
        endAt: visita.endAt,
        allDay,
        status: STATUS_MAP[visita.status] ?? "confirmed",
        version: { increment: 1 },
      },
    });
    await setEventOwner(visita.tenantId, visita.id, visita.assignedUserId, actorId);
    await recordCalendarAudit({
      tenantId: visita.tenantId,
      eventId: visita.id,
      actorId,
      action: "updated",
      payload: { mirroredFrom: "agenda_visita", status: visita.status },
    });
  } catch (err) {
    console.warn(
      "[calendar-v2] mirrorVisitaToV2 falló:",
      err instanceof Error ? err.message : err,
    );
  }
}

async function contactsAsExternals(visita: VisitaLike) {
  const contactIds = Array.isArray(visita.contactIds)
    ? (visita.contactIds as string[])
    : [];
  if (!contactIds.length) return [];
  const contacts = await prisma.crmContact.findMany({
    where: { tenantId: visita.tenantId, id: { in: contactIds } },
    select: { id: true, firstName: true, lastName: true, email: true },
  });
  return contacts
    .filter((c) => c.email)
    .map((c) => ({
      email: c.email as string,
      name: `${c.firstName} ${c.lastName}`.trim() || null,
      crmContactId: c.id,
    }));
}
