import { prisma } from "@/lib/prisma";
import { GOOGLE_CALENDAR_DISCONNECT_ERROR } from "@/lib/google-workspace/calendar-disconnect";
import { syncAgendaVisitaToCalendar } from "./agenda-sync";
import { syncLicitacionToCalendar } from "./agenda-sync-licitacion";

const DEFAULT_CAP = 20;

/**
 * Reintenta AgendaEventLink en PENDING de un tenant (cap 20).
 * - `agenda_visita`: re-sync normal a Google Calendar.
 * - `licitacion`: ya no se sincroniza; se cancela el vínculo legacy en Google
 *   (incluye SYNCED pendientes de cleanup).
 * También incluye ERROR por disconnect (si aún no se reactivaron a PENDING).
 * Best-effort: cada fallo se loguea y no corta el resto.
 */
export async function retryPendingAgendaLinks(params: {
  tenantId: string;
  actorUserId?: string;
  sourceType?: "licitacion" | "agenda_visita";
  cap?: number;
}): Promise<{ retried: number }> {
  const cap = params.cap ?? DEFAULT_CAP;
  const wantLic = params.sourceType !== "agenda_visita";
  const wantVisita = params.sourceType !== "licitacion";

  const links = await prisma.agendaEventLink.findMany({
    where: {
      tenantId: params.tenantId,
      OR: [
        ...(wantVisita
          ? [
              {
                sourceType: "agenda_visita" as const,
                OR: [
                  { syncStatus: "PENDING" },
                  {
                    syncStatus: "ERROR",
                    lastError: GOOGLE_CALENDAR_DISCONNECT_ERROR,
                  },
                ],
              },
            ]
          : []),
        ...(wantLic
          ? [
              {
                sourceType: "licitacion" as const,
                syncStatus: { in: ["SYNCED", "PENDING", "ERROR"] },
              },
            ]
          : []),
      ],
    },
    orderBy: { updatedAt: "desc" },
    take: cap,
    select: { sourceType: true, sourceId: true },
  });

  let retried = 0;
  for (const link of links) {
    try {
      if (link.sourceType === "licitacion") {
        await syncLicitacionToCalendar(params.tenantId, link.sourceId, "delete", {
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
      const { retryPendingCalendarV2Links } = await import(
        "@/modules/calendar/calendar-retry-pending"
      );
      const v2 = await retryPendingCalendarV2Links(params.tenantId, params.actorUserId);
      retried += v2.retried;
    } catch (err) {
      console.warn("[calendar] retry v2 attendee_copy:", err);
    }
  }
  return { retried };
}
