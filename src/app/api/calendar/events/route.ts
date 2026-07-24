import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { requireAgendaAccess } from "@/lib/api-auth-agenda";
import { auditAgendaAction } from "@/lib/audit-productividad";
import { dateAtChileSlot } from "@/components/agenda/agenda-calendar-utils";
import { createAgendaVisita } from "@/modules/agenda/agenda.service";
import { isCalendarV2Enabled } from "@/modules/calendar/calendar-flags";

const LEGACY_TYPES = new Set(["cliente", "supervision", "otra"]);

/**
 * POST /api/calendar/events — creación desde el composer móvil (B12).
 * Crea la visita legacy (visible en toda la agenda actual) + su espejo v2 con
 * participantes internos y externos; el sync Google va por UN solo camino:
 * v2 (attendees) si hay participantes/externos, legacy si no.
 */
export async function POST(request: NextRequest) {
  const access = await requireAgendaAccess();
  if (!access.ok) return access.response;
  const { ctx } = access;

  const body = await request.json();
  const rawType = String(body.type ?? "otra");
  const type = rawType === "reunion" ? "otra" : rawType;
  if (type !== "tecnica" && !LEGACY_TYPES.has(type)) {
    return NextResponse.json({ error: "Tipo inválido" }, { status: 400 });
  }
  const date = String(body.date ?? "");
  const [hh, mm] = String(body.time ?? "09:00").split(":").map(Number);
  if (!/^\d{4}-\d{2}-\d{2}$/.test(date) || Number.isNaN(hh) || Number.isNaN(mm)) {
    return NextResponse.json({ error: "Fecha/hora inválida" }, { status: 400 });
  }
  const allDay = body.allDay === true;
  const durationMin = Math.max(15, Math.min(24 * 60, Number(body.durationMin) || 60));
  const startAt = dateAtChileSlot(date, allDay ? 0 : hh * 60 + mm);
  const endAt = allDay
    ? dateAtChileSlot(date, 24 * 60 - 1)
    : new Date(startAt.getTime() + durationMin * 60_000);

  const participantIds: string[] = Array.isArray(body.participantIds)
    ? body.participantIds.filter((v: unknown): v is string => typeof v === "string")
    : [];
  const externals: Array<{ email: string; name?: string | null }> = Array.isArray(
    body.externalEmails,
  )
    ? body.externalEmails.filter(
        (e: { email?: unknown }) => typeof e?.email === "string" && e.email.includes("@"),
      )
    : [];

  // Técnica: flujo legacy dedicado (sin participantes v2 en este brief).
  if (type === "tecnica") {
    if (!body.accountId || !body.installationId) {
      return NextResponse.json(
        { error: "Visita técnica requiere cuenta e instalación" },
        { status: 400 },
      );
    }
    const { createVisitaTecnicaFromAgenda } = await import(
      "@/modules/agenda/agenda.service"
    );
    const result = await createVisitaTecnicaFromAgenda({
      tenantId: ctx.tenantId,
      assignedUserId: typeof body.ownerId === "string" ? body.ownerId : ctx.userId,
      accountId: body.accountId,
      installationId: body.installationId,
      dealId: body.dealId ?? null,
      startAt,
      notes: body.notes ?? null,
    });
    return NextResponse.json(
      { visita: result.visita, syncStatus: result.sync.syncStatus },
      { status: 201 },
    );
  }

  const v2 = isCalendarV2Enabled();
  const hasPeople = participantIds.length > 0 || externals.length > 0;
  const syncGoogle = body.syncGoogle !== false;
  // Un solo camino de sync: v2 (attendees) cuando hay gente, legacy si no.
  const useV2Sync = v2 && hasPeople;

  const { visita } = await createAgendaVisita({
    tenantId: ctx.tenantId,
    createdBy: ctx.userId,
    type: type as "cliente" | "supervision" | "otra",
    title: String(body.title || "Nuevo evento"),
    accountId: body.accountId ?? null,
    installationId: body.installationId ?? null,
    dealId: body.dealId ?? null,
    assignedUserId: typeof body.ownerId === "string" ? body.ownerId : ctx.userId,
    startAt,
    endAt,
    notes: body.notes ?? null,
    customAddress: body.customAddress ?? null,
    syncCalendar: syncGoogle && !useV2Sync,
    inviteContacts: false,
  });

  let syncStatus = "SKIPPED";
  if (v2) {
    const extras = participantIds.filter((id) => id !== visita.assignedUserId);
    const { addEventParticipants } = await import(
      "@/modules/calendar/calendar-participants"
    );
    await addEventParticipants(
      ctx.tenantId,
      visita.id,
      extras.map((userId) => ({ userId, role: "required" as const })),
      ctx.userId,
    );
    for (const ext of externals) {
      await prisma.calendarExternalAttendee.upsert({
        where: { eventId_email: { eventId: visita.id, email: ext.email } },
        create: {
          tenantId: ctx.tenantId,
          eventId: visita.id,
          email: ext.email,
          name: ext.name ?? null,
        },
        update: { name: ext.name ?? null },
      });
    }

    if (useV2Sync && syncGoogle) {
      const { syncCalendarEventToGoogle } = await import(
        "@/modules/calendar/calendar-google-sync"
      );
      syncStatus = (await syncCalendarEventToGoogle(ctx.tenantId, visita.id)).syncStatus;
    }

    if (body.notifyOpai !== false && extras.length) {
      const { notifyCalendarEvent } = await import("@/modules/calendar/calendar-notify");
      await notifyCalendarEvent({
        tenantId: ctx.tenantId,
        eventId: visita.id,
        kind: "invited",
        actorId: ctx.userId,
        targetUserIds: extras,
      }).catch(() => undefined);
    }
  }

  void auditAgendaAction({
    tenantId: ctx.tenantId,
    userId: ctx.userId,
    userEmail: ctx.userEmail,
    action: "created",
    visitaId: visita.id,
    meta: { title: visita.title, type: visita.type },
  });

  return NextResponse.json({ visita, syncStatus }, { status: 201 });
}
