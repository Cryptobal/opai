import { prisma } from "@/lib/prisma";
import { syncEventLink } from "@/lib/google-workspace";

/**
 * Cancela en Google Calendar la banda all-day legacy de licitación (fecha de
 * entrega del deal). Esa fecha ya no se sincroniza: solo los eventos de
 * Agenda del negocio (`agenda_visita`) van a Calendar.
 *
 * Se mantiene el export para cleanup (cron, delete cascade, callers viejos).
 * `mode` se ignora: siempre cancela.
 */
export async function syncLicitacionToCalendar(
  tenantId: string,
  dealId: string,
  _mode: "upsert" | "delete" = "delete",
  opts?: { actorUserId?: string },
): Promise<{ syncStatus: string }> {
  const link = await prisma.agendaEventLink.findFirst({
    where: { tenantId, sourceType: "licitacion", sourceId: dealId },
    select: {
      id: true,
      googleEventId: true,
      calendarAccountId: true,
    },
  });

  if (!link) return { syncStatus: "CANCELLED" };

  // Sin evento en Google: solo marcar cancelado en BD (no crear vínculos nuevos).
  if (!link.googleEventId) {
    await prisma.agendaEventLink.update({
      where: { id: link.id },
      data: {
        syncStatus: "CANCELLED",
        lastError: null,
        lastSyncAt: new Date(),
        htmlLink: null,
      },
    });
    return { syncStatus: "CANCELLED" };
  }

  const deal = await prisma.crmDeal.findFirst({
    where: { id: dealId, tenantId },
    include: { account: { select: { ownerId: true } } },
  });
  const assignedUserId =
    deal?.account.ownerId ?? opts?.actorUserId ?? null;

  if (!assignedUserId) {
    // Sin dueño no podemos hablar con Calendar; limpiar estado local.
    await prisma.agendaEventLink.update({
      where: { id: link.id },
      data: {
        syncStatus: "CANCELLED",
        lastError: null,
        lastSyncAt: new Date(),
        htmlLink: null,
        googleEventId: null,
      },
    });
    return { syncStatus: "CANCELLED" };
  }

  return syncEventLink(
    {
      tenantId,
      sourceType: "licitacion",
      sourceId: dealId,
      assignedUserId,
      allDay: true,
    },
    null,
  );
}
