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

  if (mode === "delete" || visita.status === "cancelada") {
    return syncEventLink(
      {
        tenantId,
        sourceType: "agenda_visita",
        sourceId: visita.id,
        assignedUserId: visita.assignedUserId,
      },
      null,
    );
  }

  const account = await prisma.googleCalendarAccount.findFirst({
    where: { tenantId, userId: visita.assignedUserId, status: "ACTIVE" },
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
      assignedUserId: visita.assignedUserId,
    },
    payload,
  );
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
