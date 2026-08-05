/**
 * POST /api/calendar/events/[id]/resync
 * Reenvía el evento a Google Calendar (puede reenviar invitaciones).
 */
import { NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { requireAgendaAccess } from "@/lib/api-auth-agenda";
import { syncCalendarEventToGoogle } from "@/modules/calendar/calendar-google-sync";
import { sanitizeSyncReason } from "@/modules/agenda/agenda-sync-reason";

export async function POST(
  _request: Request,
  { params }: { params: Promise<{ id: string }> },
) {
  const auth = await requireAgendaAccess();
  if (!auth.ok) return auth.response;

  const { id } = await params;
  const tenantId = auth.ctx.tenantId;

  const event = await prisma.calendarEvent.findFirst({
    where: { id, tenantId, deletedAt: null },
    select: { id: true },
  });
  if (!event) {
    // Compat: id de AgendaVisita espejado 1:1.
    const visita = await prisma.agendaVisita.findFirst({
      where: { id, tenantId },
      select: { id: true },
    });
    if (!visita) {
      return NextResponse.json({ error: "Evento no encontrado" }, { status: 404 });
    }
  }

  const result = await syncCalendarEventToGoogle(tenantId, id);
  const link = await prisma.calendarProviderLink.findFirst({
    where: {
      tenantId,
      eventId: id,
      provider: "google",
      role: "organizer",
    },
    select: { syncStatus: true, lastError: true, htmlLink: true },
    orderBy: { lastSyncAt: "desc" },
  });

  return NextResponse.json({
    success: result.syncStatus === "SYNCED",
    syncStatus: result.syncStatus,
    syncReason: sanitizeSyncReason(link?.lastError),
    htmlLink: link?.htmlLink ?? null,
  });
}
