/**
 * POST /api/crm/correos/[threadId]/meeting (Bloque 7): agenda una reunión desde
 * el correo (CalendarEvent + participantes externos) y la vincula al hilo
 * (CrmEmailThreadLink calendar_event, linked_via "email_panel"). Permiso:
 * Productividad (requireCorreosAccess). Si el hilo tiene cuenta, el evento la
 * hereda (accountId).
 */
import { NextRequest, NextResponse } from "next/server";
import { auth } from "@/lib/auth";
import { prisma } from "@/lib/prisma";
import { requireCorreosAccess } from "@/lib/api-auth-productividad";
import { createCalendarEvent } from "@/modules/calendar/calendar.service";

export const dynamic = "force-dynamic";

type Body = {
  title?: string;
  startAt?: string;
  durationMin?: number;
  attendeeEmails?: string[];
};

export async function POST(req: NextRequest, ctx: { params: Promise<{ threadId: string }> }) {
  const mod = await requireCorreosAccess();
  if (!mod.authorized) return mod.response;
  const session = await auth();
  if (!session?.user?.tenantId) return NextResponse.json({ error: "No autorizado" }, { status: 401 });
  const tenantId = session.user.tenantId;
  const userId = session.user.id;
  const { threadId } = await ctx.params;

  const account = await prisma.crmEmailAccount.findFirst({
    where: { tenantId, userId, provider: "gmail", status: "active" },
    select: { id: true },
  });
  if (!account) return NextResponse.json({ error: "Gmail no conectado" }, { status: 400 });
  const thread = await prisma.crmEmailThread.findFirst({
    where: { id: threadId, tenantId, emailAccountId: account.id },
    select: { id: true, accountId: true },
  });
  if (!thread) return NextResponse.json({ error: "Hilo no encontrado" }, { status: 404 });

  const body = (await req.json().catch(() => ({}))) as Body;
  const title = typeof body.title === "string" ? body.title.trim().slice(0, 200) : "";
  const startAt = body.startAt ? new Date(body.startAt) : null;
  if (!title || !startAt || Number.isNaN(startAt.getTime())) {
    return NextResponse.json({ error: "Título y fecha/hora son requeridos" }, { status: 400 });
  }
  const durationMin = typeof body.durationMin === "number" && body.durationMin > 0 ? Math.min(body.durationMin, 480) : 30;
  const endAt = new Date(startAt.getTime() + durationMin * 60_000);
  const externalAttendees = (Array.isArray(body.attendeeEmails) ? body.attendeeEmails : [])
    .filter((e) => typeof e === "string" && e.includes("@"))
    .slice(0, 20)
    .map((email) => ({ email }));

  const event = await createCalendarEvent({
    tenantId,
    createdBy: userId,
    kind: "event",
    title,
    startAt,
    endAt,
    accountId: thread.accountId ?? null,
    externalAttendees,
  });

  await prisma.crmEmailThreadLink.upsert({
    where: {
      threadId_entityType_entityId: { threadId, entityType: "calendar_event", entityId: event.id },
    },
    create: { tenantId, threadId, entityType: "calendar_event", entityId: event.id, linkedVia: "email_panel", createdBy: userId },
    update: {},
  });

  return NextResponse.json({
    ok: true,
    event: { id: event.id, title, startAt: startAt.toISOString(), endAt: endAt.toISOString() },
  });
}
