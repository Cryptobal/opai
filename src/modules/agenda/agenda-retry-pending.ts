import { prisma } from "@/lib/prisma";
import { GOOGLE_CALENDAR_DISCONNECT_ERROR } from "@/lib/google-workspace/calendar-disconnect";
import { syncAgendaVisitaToCalendar } from "./agenda-sync";
import { syncLicitacionToCalendar } from "./agenda-sync-licitacion";

const DEFAULT_CAP = 20;

/**
 * Reintenta AgendaEventLink en PENDING de un tenant (cap 20): licitaciones y
 * visitas cuyo dueño no tenía Google Calendar conectado al momento del sync.
 * También incluye ERROR por disconnect (si aún no se reactivaron a PENDING).
 * Best-effort: cada fallo se loguea y no corta el resto.
 */
export async function retryPendingAgendaLinks(params: {
  tenantId: string;
  actorUserId?: string;
  sourceType?: "licitacion" | "agenda_visita";
  cap?: number;
}): Promise<{ retried: number }> {
  const links = await prisma.agendaEventLink.findMany({
    where: {
      tenantId: params.tenantId,
      sourceType: params.sourceType
        ? params.sourceType
        : { in: ["licitacion", "agenda_visita"] },
      OR: [
        { syncStatus: "PENDING" },
        {
          syncStatus: "ERROR",
          lastError: GOOGLE_CALENDAR_DISCONNECT_ERROR,
        },
      ],
    },
    orderBy: { updatedAt: "desc" },
    take: params.cap ?? DEFAULT_CAP,
    select: { sourceType: true, sourceId: true },
  });

  let retried = 0;
  for (const link of links) {
    try {
      if (link.sourceType === "licitacion") {
        await syncLicitacionToCalendar(params.tenantId, link.sourceId, "upsert", {
          actorUserId: params.actorUserId,
        });
      } else if (link.sourceType === "agenda_visita") {
        await syncAgendaVisitaToCalendar(params.tenantId, link.sourceId);
      }
      retried += 1;
    } catch (err) {
      console.warn("[calendar] retry pending link:", link.sourceType, link.sourceId, err);
    }
  }

  // Calendar v2: materializar copias attendee_copy del usuario que conectó.
  if (params.actorUserId) {
    try {
      const [{ isCalendarV2Enabled }, { retryPendingCalendarV2Links }] = await Promise.all([
        import("@/modules/calendar/calendar-flags"),
        import("@/modules/calendar/calendar-retry-pending"),
      ]);
      if (isCalendarV2Enabled()) {
        const v2 = await retryPendingCalendarV2Links(params.tenantId, params.actorUserId);
        retried += v2.retried;
      }
    } catch (err) {
      console.warn("[calendar] retry v2 attendee_copy:", err);
    }
  }
  return { retried };
}
