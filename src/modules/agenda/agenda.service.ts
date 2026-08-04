import { prisma } from "@/lib/prisma";
import { syncAgendaVisitaToCalendar } from "./agenda-sync";
import { mirrorVisitaToV2 } from "@/modules/calendar/calendar-mapper";

export async function createAgendaVisita(input: {
  tenantId: string;
  createdBy: string;
  type: "cliente" | "supervision" | "otra";
  title: string;
  label?: string | null;
  accountId?: string | null;
  installationId?: string | null;
  dealId?: string | null;
  assignedUserId: string;
  startAt: Date;
  endAt: Date;
  allDay?: boolean;
  notes?: string | null;
  customAddress?: string | null;
  lat?: number | null;
  lng?: number | null;
  contactIds?: string[] | null;
  // Toggles del modal (defaults desde prefs de la config).
  syncCalendar?: boolean;
  inviteContacts?: boolean;
}) {
  const visita = await prisma.agendaVisita.create({
    data: {
      tenantId: input.tenantId,
      type: input.type,
      title: input.title,
      label: input.label ?? null,
      accountId: input.accountId ?? null,
      installationId: input.installationId ?? null,
      dealId: input.dealId ?? null,
      assignedUserId: input.assignedUserId,
      startAt: input.startAt,
      endAt: input.endAt,
      allDay: input.allDay === true,
      notes: input.notes ?? null,
      customAddress: input.customAddress ?? null,
      lat: input.lat ?? null,
      lng: input.lng ?? null,
      contactIds: input.contactIds ?? undefined,
      createdBy: input.createdBy,
      status: "programada",
    },
  });
  // Espejo v2 antes del sync: si el sync delega a v2, necesita el estado fresco.
  await mirrorVisitaToV2(visita, input.createdBy, { allDay: input.allDay === true });
  // Si el usuario destildó "crear evento en Calendar", la visita queda sin evento.
  const sync =
    input.syncCalendar === false
      ? { syncStatus: "SKIPPED" }
      : await syncAgendaVisitaToCalendar(input.tenantId, visita.id, "upsert", {
          inviteContacts: input.inviteContacts,
          allDay: input.allDay === true,
        });
  return { visita, sync };
}

export async function reprogramAgendaVisita(
  tenantId: string,
  id: string,
  startAt: Date,
  endAt: Date,
  assignedUserId?: string,
) {
  const existing = await prisma.agendaVisita.findFirst({ where: { id, tenantId } });
  if (!existing) return null;

  let nextAssignee = existing.assignedUserId;
  if (assignedUserId && assignedUserId !== existing.assignedUserId) {
    const assignee = await prisma.admin.findFirst({
      where: { id: assignedUserId, tenantId, status: "active" },
      select: { id: true },
    });
    if (!assignee) return null;
    // El evento Google del organizador se conserva; solo cambia el participante owner.
    nextAssignee = assignee.id;
  }

  const visita = await prisma.agendaVisita.update({
    where: { id },
    data: {
      startAt,
      endAt,
      assignedUserId: nextAssignee,
      status: "reprogramada",
    },
  });
  await mirrorVisitaToV2(visita);
  const sync = await syncAgendaVisitaToCalendar(tenantId, id);
  return { visita, sync };
}

export async function completeAgendaVisita(
  tenantId: string,
  id: string,
  resultNote: string,
) {
  const existing = await prisma.agendaVisita.findFirst({ where: { id, tenantId } });
  if (!existing) return null;
  const visita = await prisma.agendaVisita.update({
    where: { id },
    data: { status: "completada", resultNote },
  });
  // Evento permanece; no se elimina al completar.
  await mirrorVisitaToV2(visita);
  return { visita };
}

export async function cancelAgendaVisita(tenantId: string, id: string) {
  const existing = await prisma.agendaVisita.findFirst({ where: { id, tenantId } });
  if (!existing) return null;
  const visita = await prisma.agendaVisita.update({
    where: { id },
    data: { status: "cancelada" },
  });
  await mirrorVisitaToV2(visita);
  const sync = await syncAgendaVisitaToCalendar(tenantId, id, "delete");
  return { visita, sync };
}

export { listAgenda, listLicitacionesEnCarpeta } from "./agenda-list";
