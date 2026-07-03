/**
 * Enriquecimiento de tarjetas de Slack por tipo de evento.
 *
 * Sólo para tickets: dispatch tiene el `ticketId` pero NO el objeto, así que
 * carga lo mínimo (prioridad/estado/asignado/instalación/SLA) con una query
 * acotada por tenant. Los demás emisores (leads, postulaciones) enriquecen su
 * propio `data` en origen, sin queries duplicadas acá.
 */

import { prisma } from "@/lib/prisma";
import { TICKET_PRIORITY_CONFIG, TICKET_STATUS_CONFIG } from "@/lib/tickets";

export interface CardField {
  label: string;
  value: string;
}

// Hora de vencimiento SLA en horario de Chile (el server corre en UTC).
const slaFmt = new Intl.DateTimeFormat("es-CL", {
  timeZone: "America/Santiago",
  day: "numeric",
  month: "short",
  hour: "2-digit",
  minute: "2-digit",
});

/** Campos curados de un ticket para la tarjeta. `[]` si no existe o no es del tenant. */
export async function enrichTicketFields(tenantId: string, ticketId: string): Promise<CardField[]> {
  const t = await prisma.opsTicket.findFirst({
    where: { id: ticketId, tenantId },
    select: {
      priority: true,
      status: true,
      assignedTo: true,
      installationId: true,
      slaDueAt: true,
      slaBreached: true,
    },
  });
  if (!t) return [];

  const fields: CardField[] = [
    {
      label: "Prioridad",
      value: TICKET_PRIORITY_CONFIG[t.priority as keyof typeof TICKET_PRIORITY_CONFIG]?.label ?? t.priority,
    },
    {
      label: "Estado",
      value: TICKET_STATUS_CONFIG[t.status as keyof typeof TICKET_STATUS_CONFIG]?.label ?? t.status,
    },
  ];

  let asignado = "Sin asignar";
  if (t.assignedTo) {
    const admin = await prisma.admin.findFirst({
      where: { id: t.assignedTo, tenantId },
      select: { name: true },
    });
    if (admin?.name) asignado = admin.name;
  }
  fields.push({ label: "Asignado", value: asignado });

  if (t.installationId) {
    const inst = await prisma.crmInstallation.findFirst({
      where: { id: t.installationId, tenantId },
      select: { name: true },
    });
    if (inst?.name) fields.push({ label: "Instalación", value: inst.name });
  }

  if (t.slaDueAt) {
    const when = slaFmt.format(t.slaDueAt);
    fields.push({ label: "Vence SLA", value: t.slaBreached ? `🔴 ${when} (vencido)` : when });
  }

  return fields;
}
