import { prisma } from "@/lib/prisma";
import { syncAgendaVisitaToCalendar } from "./agenda-sync";

export async function createAgendaVisita(input: {
  tenantId: string;
  createdBy: string;
  type: "cliente" | "supervision" | "otra";
  title: string;
  accountId?: string | null;
  installationId?: string | null;
  dealId?: string | null;
  assignedUserId: string;
  startAt: Date;
  endAt: Date;
  notes?: string | null;
  customAddress?: string | null;
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
      accountId: input.accountId ?? null,
      installationId: input.installationId ?? null,
      dealId: input.dealId ?? null,
      assignedUserId: input.assignedUserId,
      startAt: input.startAt,
      endAt: input.endAt,
      notes: input.notes ?? null,
      customAddress: input.customAddress ?? null,
      contactIds: input.contactIds ?? undefined,
      createdBy: input.createdBy,
      status: "programada",
    },
  });
  // Si el usuario destildó "crear evento en Calendar", la visita queda sin evento.
  const sync =
    input.syncCalendar === false
      ? { syncStatus: "SKIPPED" }
      : await syncAgendaVisitaToCalendar(input.tenantId, visita.id, "upsert", {
          inviteContacts: input.inviteContacts,
        });
  return { visita, sync };
}

export async function reprogramAgendaVisita(
  tenantId: string,
  id: string,
  startAt: Date,
  endAt: Date,
) {
  const existing = await prisma.agendaVisita.findFirst({ where: { id, tenantId } });
  if (!existing) return null;
  const visita = await prisma.agendaVisita.update({
    where: { id },
    data: { startAt, endAt, status: "reprogramada" },
  });
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
  return { visita };
}

export async function cancelAgendaVisita(tenantId: string, id: string) {
  const existing = await prisma.agendaVisita.findFirst({ where: { id, tenantId } });
  if (!existing) return null;
  const visita = await prisma.agendaVisita.update({
    where: { id },
    data: { status: "cancelada" },
  });
  const sync = await syncAgendaVisitaToCalendar(tenantId, id, "delete");
  return { visita, sync };
}

export async function createVisitaTecnicaFromAgenda(input: {
  tenantId: string;
  assignedUserId: string;
  accountId: string;
  installationId: string;
  dealId?: string | null;
  startAt: Date;
  notes?: string | null;
}) {
  const { syncVisitaTecnicaToCalendar } = await import("./agenda-sync");
  const visita = await prisma.opsVisitaTecnica.create({
    data: {
      tenantId: input.tenantId,
      userId: input.assignedUserId,
      accountId: input.accountId,
      installationId: input.installationId,
      dealId: input.dealId ?? null,
      scheduledAt: input.startAt,
      status: "programada",
      generalReport: input.notes ?? null,
    },
  });
  const sync = await syncVisitaTecnicaToCalendar(input.tenantId, visita.id);
  return { visita, sync };
}

export { listAgenda, listLicitacionesEnCarpeta } from "./agenda-list";
