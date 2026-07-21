import { prisma } from "@/lib/prisma";
import { getCanonicalSiteUrl } from "@/lib/emails/site-url";
import { todayInChile } from "@/lib/dates-cl";
import { buildLicitacionEventPayload, syncEventLink } from "@/lib/google-workspace";

/** YYYY-MM-DD de un campo @db.Date (UTC midnight, sin shift de zona). */
function ymdOfDateColumn(d: Date): string {
  return d.toISOString().slice(0, 10);
}

/**
 * Resuelve y persiste el inicio del rango all-day de la licitación: se fija
 * la primera vez que se sincroniza (hoy en Chile) y solo retrocede si la
 * fecha de entrega quedó antes del inicio ya guardado.
 */
async function resolveRangeStartYmd(
  tenantId: string,
  dealId: string,
  fechaEntrega: Date,
): Promise<string> {
  const link = await prisma.agendaEventLink.findFirst({
    where: { tenantId, sourceType: "licitacion", sourceId: dealId },
    select: { id: true, rangeStartYmd: true },
  });
  let rangeStartYmd = link?.rangeStartYmd ?? todayInChile();
  const entregaYmd = ymdOfDateColumn(fechaEntrega);
  if (entregaYmd < rangeStartYmd) rangeStartYmd = entregaYmd;

  if (!link) {
    await prisma.agendaEventLink.create({
      data: {
        tenantId,
        sourceType: "licitacion",
        sourceId: dealId,
        allDay: true,
        syncStatus: "PENDING",
        rangeStartYmd,
      },
    });
  } else if (link.rangeStartYmd !== rangeStartYmd) {
    await prisma.agendaEventLink.update({
      where: { id: link.id },
      data: { rangeStartYmd },
    });
  }
  return rangeStartYmd;
}

/**
 * Sync licitación → Google Calendar como banda all-day desde que se marca
 * hasta la entrega. Dueño del evento: owner de la cuenta, con fallback al
 * usuario que gatilló la acción (`opts.actorUserId`). Sin dueño o sin
 * Calendar conectado → link PENDING (lo reintentan el OAuth callback y el
 * cron de recordatorios).
 */
export async function syncLicitacionToCalendar(
  tenantId: string,
  dealId: string,
  mode: "upsert" | "delete" = "upsert",
  opts?: { actorUserId?: string },
): Promise<{ syncStatus: string }> {
  const deal = await prisma.crmDeal.findFirst({
    where: { id: dealId, tenantId },
    include: { account: { select: { ownerId: true } } },
  });
  if (!deal) return { syncStatus: "ERROR" };

  const assignedUserId = deal.account.ownerId ?? opts?.actorUserId ?? null;
  const isActive =
    mode !== "delete" && deal.isLicitacion && Boolean(deal.fechaEntrega) && deal.status === "open";

  if (!assignedUserId) {
    if (isActive && deal.fechaEntrega) {
      await resolveRangeStartYmd(tenantId, dealId, deal.fechaEntrega);
    } else {
      await prisma.agendaEventLink.upsert({
        where: { sourceType_sourceId: { sourceType: "licitacion", sourceId: dealId } },
        create: { tenantId, sourceType: "licitacion", sourceId: dealId, allDay: true, syncStatus: "PENDING" },
        update: { syncStatus: "PENDING", allDay: true },
      });
    }
    return { syncStatus: "PENDING" };
  }

  if (!isActive || !deal.fechaEntrega) {
    return syncEventLink(
      { tenantId, sourceType: "licitacion", sourceId: dealId, assignedUserId, allDay: true },
      null,
    );
  }

  const rangeStartYmd = await resolveRangeStartYmd(tenantId, dealId, deal.fechaEntrega);
  const payload = buildLicitacionEventPayload({
    title: deal.title,
    fechaEntrega: deal.fechaEntrega,
    rangeStartYmd,
    opaiUrl: `${getCanonicalSiteUrl()}/crm/deals/${deal.id}`,
  });

  return syncEventLink(
    { tenantId, sourceType: "licitacion", sourceId: dealId, assignedUserId, allDay: true },
    payload,
  );
}
