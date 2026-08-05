import { prisma } from "@/lib/prisma";
import { getCanonicalSiteUrl } from "@/lib/emails/site-url";
import { startOfDayChile } from "@/lib/dates-cl";
import { buildVisitaEventPayload, syncEventLink } from "@/lib/google-workspace";

export { syncLicitacionToCalendar } from "./agenda-sync-licitacion";

const TYPE_LABELS: Record<string, string> = {
  cliente: "Cliente",
  supervision: "Supervisión",
  otra: "Visita",
  tecnica: "Técnica",
};

/** Hito/evento “todo el día” Chile: arranca ~00:00 y cubre ≥23h (o ya marcado). */
export function isAgendaVisitaAllDay(
  startAt: Date,
  endAt: Date,
  explicit?: boolean | null,
): boolean {
  if (explicit === true) return true;
  if (explicit === false) return false;
  const sod = startOfDayChile(startAt);
  if (Math.abs(startAt.getTime() - sod.getTime()) > 60_000) return false;
  return endAt.getTime() - startAt.getTime() >= 23 * 60 * 60_000;
}

export async function syncAgendaVisitaToCalendar(
  tenantId: string,
  visitaId: string,
  mode: "upsert" | "delete" = "upsert",
  opts?: { inviteContacts?: boolean; allDay?: boolean },
): Promise<{ syncStatus: string }> {
  const visita = await prisma.agendaVisita.findFirst({
    where: { id: visitaId, tenantId },
    include: {
      account: { select: { name: true } },
      installation: { select: { name: true, address: true } },
    },
  });
  if (!visita) return { syncStatus: "ERROR" };

  // Calendar v2 es el único camino cuando existe el espejo CalendarEvent.
  // Eventos legacy sin espejo siguen por AgendaEventLink (resolveSyncUserId).
  const v2Event = await prisma.calendarEvent.findFirst({
    where: { id: visita.id, tenantId },
    select: { id: true },
  });
  if (v2Event) {
    const { syncCalendarEventToGoogle } = await import(
      "@/modules/calendar/calendar-google-sync"
    );
    return syncCalendarEventToGoogle(tenantId, visita.id);
  }

  // Si el link ya tiene un evento Google creado, seguir sincronizando con la
  // cuenta dueña de ese evento (el organizador), aunque la visita se haya
  // reasignado — jamás patch/delete contra el calendario equivocado (fix B2).
  const syncUserId = await resolveSyncUserId(tenantId, visita.id, visita.assignedUserId);

  if (mode === "delete" || visita.status === "cancelada") {
    return syncEventLink(
      {
        tenantId,
        sourceType: "agenda_visita",
        sourceId: visita.id,
        assignedUserId: syncUserId,
      },
      null,
    );
  }

  const account = await prisma.googleCalendarAccount.findFirst({
    where: { tenantId, userId: syncUserId, status: "ACTIVE" },
  });
  const prefs = (account?.prefs ?? {}) as { inviteContacts?: boolean };
  const contactIds = Array.isArray(visita.contactIds)
    ? (visita.contactIds as string[])
    : [];
  const contacts = contactIds.length
    ? await prisma.crmContact.findMany({
        where: { tenantId, id: { in: contactIds } },
        select: { firstName: true, lastName: true, roleTitle: true, phone: true, email: true },
      })
    : [];

  const existingLink = await prisma.agendaEventLink.findUnique({
    where: { sourceType_sourceId: { sourceType: "agenda_visita", sourceId: visita.id } },
    select: { allDay: true },
  });
  const allDay = isAgendaVisitaAllDay(
    visita.startAt,
    visita.endAt,
    opts?.allDay ?? (existingLink?.allDay ? true : null),
  );

  const payload = buildVisitaEventPayload(
    { startAt: visita.startAt, endAt: visita.endAt, title: visita.title },
    {
      typeLabel: TYPE_LABELS[visita.type] ?? "Visita",
      accountName: visita.account?.name ?? "Sin cuenta",
      installationName: visita.installation?.name,
      address: visita.customAddress ?? visita.installation?.address,
      notes: visita.notes,
      contacts: contacts.map((c) => ({
        name: `${c.firstName} ${c.lastName}`.trim(),
        role: c.roleTitle,
        phone: c.phone,
        email: c.email,
      })),
      opaiUrl: `${getCanonicalSiteUrl()}/opai/agenda?visita=${visita.id}`,
      inviteContacts: opts?.inviteContacts ?? prefs.inviteContacts !== false,
      allDay,
    },
  );

  return syncEventLink(
    {
      tenantId,
      sourceType: "agenda_visita",
      sourceId: visita.id,
      assignedUserId: syncUserId,
      allDay,
    },
    payload,
  );
}

/** Usuario cuya cuenta Google posee el evento del link (o el asignado si no hay evento). */
async function resolveSyncUserId(
  tenantId: string,
  visitaId: string,
  assignedUserId: string,
): Promise<string> {
  const link = await prisma.agendaEventLink.findUnique({
    where: { sourceType_sourceId: { sourceType: "agenda_visita", sourceId: visitaId } },
    select: { googleEventId: true, calendarAccountId: true },
  });
  if (!link?.googleEventId || !link.calendarAccountId) return assignedUserId;
  const owner = await prisma.googleCalendarAccount.findFirst({
    where: { id: link.calendarAccountId, tenantId, status: "ACTIVE" },
    select: { userId: true },
  });
  return owner?.userId ?? assignedUserId;
}
