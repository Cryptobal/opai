import { prisma } from "@/lib/prisma";
import { getCanonicalSiteUrl } from "@/lib/emails/site-url";
import { buildVisitaEventPayload, syncEventLink } from "@/lib/google-workspace";

export { syncLicitacionToCalendar } from "./agenda-sync-licitacion";

const TYPE_LABELS: Record<string, string> = {
  cliente: "Cliente",
  supervision: "Supervisión",
  otra: "Visita",
  tecnica: "Técnica",
};

export async function syncAgendaVisitaToCalendar(
  tenantId: string,
  visitaId: string,
  mode: "upsert" | "delete" = "upsert",
  opts?: { inviteContacts?: boolean },
): Promise<{ syncStatus: string }> {
  const visita = await prisma.agendaVisita.findFirst({
    where: { id: visitaId, tenantId },
    include: {
      account: { select: { name: true } },
      installation: { select: { name: true, address: true } },
    },
  });
  if (!visita) return { syncStatus: "ERROR" };

  // Delegación v2: si el evento ya sincroniza vía CalendarProviderLink
  // (creado por el composer con participantes), UN solo camino de sync —
  // evita duplicar el evento en Google.
  const { isCalendarV2Enabled } = await import("@/modules/calendar/calendar-flags");
  if (isCalendarV2Enabled()) {
    const v2Link = await prisma.calendarProviderLink.findFirst({
      where: { tenantId, eventId: visita.id, provider: "google" },
      select: { id: true },
    });
    if (v2Link) {
      const { syncCalendarEventToGoogle } = await import(
        "@/modules/calendar/calendar-google-sync"
      );
      return syncCalendarEventToGoogle(tenantId, visita.id);
    }
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

  const payload = buildVisitaEventPayload(
    { startAt: visita.startAt, endAt: visita.endAt },
    {
      typeLabel: TYPE_LABELS[visita.type] ?? "Visita",
      accountName: visita.account?.name ?? "Sin cuenta",
      installationName: visita.installation?.name,
      address: visita.installation?.address ?? visita.customAddress,
      notes: visita.notes,
      contacts: contacts.map((c) => ({
        name: `${c.firstName} ${c.lastName}`.trim(),
        role: c.roleTitle,
        phone: c.phone,
        email: c.email,
      })),
      opaiUrl: `${getCanonicalSiteUrl()}/opai/agenda?visita=${visita.id}`,
      inviteContacts: opts?.inviteContacts ?? prefs.inviteContacts !== false,
    },
  );

  return syncEventLink(
    {
      tenantId,
      sourceType: "agenda_visita",
      sourceId: visita.id,
      assignedUserId: syncUserId,
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

export async function syncVisitaTecnicaToCalendar(
  tenantId: string,
  visitaId: string,
  mode: "upsert" | "delete" = "upsert",
): Promise<{ syncStatus: string }> {
  const visita = await prisma.opsVisitaTecnica.findFirst({
    where: { id: visitaId, tenantId },
    include: {
      account: { select: { name: true } },
      installation: { select: { name: true, address: true } },
    },
  });
  if (!visita?.scheduledAt) return { syncStatus: "PENDING" };

  if (mode === "delete" || visita.status === "completada") {
    // No borrar evento al completar; solo al cancelar explícito
    if (mode === "delete") {
      return syncEventLink(
        {
          tenantId,
          sourceType: "visita_tecnica",
          sourceId: visita.id,
          assignedUserId: visita.userId,
        },
        null,
      );
    }
  }

  const endAt = new Date(visita.scheduledAt.getTime() + 60 * 60_000);
  const payload = buildVisitaEventPayload(
    { startAt: visita.scheduledAt, endAt },
    {
      typeLabel: "Técnica",
      accountName: visita.account?.name ?? "Sin cuenta",
      installationName: visita.installation?.name,
      address: visita.installation?.address,
      notes: null,
      contacts: [],
      opaiUrl: `${getCanonicalSiteUrl()}/crm/visitas-tecnicas/${visita.id}`,
      inviteContacts: false,
    },
  );

  return syncEventLink(
    {
      tenantId,
      sourceType: "visita_tecnica",
      sourceId: visita.id,
      assignedUserId: visita.userId,
    },
    payload,
  );
}
