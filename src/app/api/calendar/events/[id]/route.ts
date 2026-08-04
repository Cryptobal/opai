import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import {
  requireAgendaAccess,
  canMutateVisita,
  visitaForbidden,
  loadParticipantRolesForActor,
} from "@/lib/api-auth-agenda";
import { auditAgendaAction } from "@/lib/audit-productividad";
import { dateAtChileSlot } from "@/components/agenda/agenda-calendar-utils";
import {
  cancelOpaiEvent,
  OpaiEventValidationError,
  updateOpaiEvent,
} from "@/modules/calendar/calendar-write";
import { getCalendarEventDetail } from "@/modules/calendar/calendar-detail";

type Ctx = { params: Promise<{ id: string }> };

async function assertCanMutate(
  ctx: Parameters<typeof canMutateVisita>[0],
  id: string,
) {
  const existing = await prisma.agendaVisita.findFirst({
    where: { id, tenantId: ctx.tenantId },
    select: { id: true, createdBy: true, assignedUserId: true },
  });
  if (!existing) return { ok: false as const, status: 404 as const };
  const participantRoles = await loadParticipantRolesForActor(
    ctx.tenantId,
    id,
    ctx.userId,
  );
  if (!canMutateVisita(ctx, { ...existing, participantRoles })) {
    return { ok: false as const, status: 403 as const };
  }
  return { ok: true as const, existing };
}

export async function GET(_req: NextRequest, routeCtx: Ctx) {
  const access = await requireAgendaAccess();
  if (!access.ok) return access.response;
  const { ctx } = access;
  const { id } = await routeCtx.params;

  const visita = await prisma.agendaVisita.findFirst({
    where: { id, tenantId: ctx.tenantId },
    include: {
      account: { select: { id: true, name: true } },
      installation: {
        select: { id: true, name: true, address: true, lat: true, lng: true },
      },
      deal: { select: { id: true, title: true } },
    },
  });
  if (!visita) return NextResponse.json({ error: "No encontrada" }, { status: 404 });

  const v2 = await getCalendarEventDetail(ctx.tenantId, id).catch(() => null);
  const providerLink = await prisma.calendarProviderLink.findFirst({
    where: {
      tenantId: ctx.tenantId,
      eventId: id,
      provider: "google",
      role: "organizer",
    },
    select: { htmlLink: true, syncStatus: true },
  });
  const legacy = await prisma.agendaEventLink.findUnique({
    where: { sourceType_sourceId: { sourceType: "agenda_visita", sourceId: id } },
    select: { htmlLink: true, syncStatus: true },
  });

  return NextResponse.json({
    visita,
    syncStatus: providerLink?.syncStatus ?? legacy?.syncStatus ?? "PENDING",
    htmlLink: providerLink?.htmlLink ?? legacy?.htmlLink ?? null,
    v2,
  });
}

export async function PATCH(request: NextRequest, routeCtx: Ctx) {
  const access = await requireAgendaAccess();
  if (!access.ok) return access.response;
  const { ctx } = access;
  const { id } = await routeCtx.params;
  const gate = await assertCanMutate(ctx, id);
  if (!gate.ok) {
    return gate.status === 404
      ? NextResponse.json({ error: "No encontrada" }, { status: 404 })
      : visitaForbidden();
  }

  const body = await request.json();

  let startAt: Date | undefined;
  let endAt: Date | undefined;
  let allDay: boolean | undefined = body.allDay === true ? true : body.allDay === false ? false : undefined;

  if (typeof body.startAt === "string") {
    startAt = new Date(body.startAt);
    endAt = body.endAt ? new Date(body.endAt) : undefined;
  } else if (typeof body.date === "string" && /^\d{4}-\d{2}-\d{2}$/.test(body.date)) {
    const [hh, mm] = String(body.time ?? "09:00").split(":").map(Number);
    const isAllDay = allDay === true;
    const durationMin = Math.max(15, Math.min(24 * 60, Number(body.durationMin) || 60));
    startAt = dateAtChileSlot(body.date, isAllDay ? 0 : hh * 60 + mm);
    endAt = isAllDay
      ? dateAtChileSlot(body.date, 24 * 60 - 1)
      : new Date(startAt.getTime() + durationMin * 60_000);
  }

  try {
    const result = await updateOpaiEvent(
      ctx.tenantId,
      id,
      {
        title: typeof body.title === "string" ? body.title : undefined,
        label: body.label !== undefined ? body.label : undefined,
        type: ["cliente", "supervision", "otra"].includes(body.type)
          ? body.type
          : undefined,
        assignedUserId:
          typeof body.assignedUserId === "string" ? body.assignedUserId : undefined,
        startAt,
        endAt,
        allDay,
        notes: body.notes !== undefined ? body.notes : undefined,
        address:
          body.customAddress !== undefined
            ? body.customAddress
            : body.address !== undefined
              ? body.address
              : undefined,
        lat: body.lat !== undefined ? body.lat : undefined,
        lng: body.lng !== undefined ? body.lng : undefined,
        accountId: body.accountId !== undefined ? body.accountId : undefined,
        installationId:
          body.installationId !== undefined ? body.installationId : undefined,
        dealId: body.dealId !== undefined ? body.dealId : undefined,
        participantIds: Array.isArray(body.participantIds)
          ? body.participantIds
          : undefined,
        externalEmails: Array.isArray(body.externalEmails)
          ? body.externalEmails
          : undefined,
        contactIds: Array.isArray(body.contactIds) ? body.contactIds : undefined,
        syncGoogle: body.syncGoogle !== false,
        notifyOpai: body.notifyOpai !== false,
        slackReminderPrevDay:
          body.slackReminderPrevDay !== undefined
            ? body.slackReminderPrevDay === true
            : undefined,
      },
      ctx.userId,
    );
    if (!result) return NextResponse.json({ error: "No encontrada" }, { status: 404 });

    void auditAgendaAction({
      tenantId: ctx.tenantId,
      userId: ctx.userId,
      userEmail: ctx.userEmail,
      action: "reprogrammed",
      visitaId: id,
      meta: { title: result.visita.title, via: "patch" },
      request,
    });

    return NextResponse.json(result);
  } catch (err) {
    if (err instanceof OpaiEventValidationError) {
      return NextResponse.json({ error: err.message }, { status: 400 });
    }
    throw err;
  }
}

export async function DELETE(request: NextRequest, routeCtx: Ctx) {
  const access = await requireAgendaAccess();
  if (!access.ok) return access.response;
  const { ctx } = access;
  const { id } = await routeCtx.params;
  const gate = await assertCanMutate(ctx, id);
  if (!gate.ok) {
    return gate.status === 404
      ? NextResponse.json({ error: "No encontrada" }, { status: 404 })
      : visitaForbidden();
  }

  const result = await cancelOpaiEvent(ctx.tenantId, id, ctx.userId);
  if (!result) return NextResponse.json({ error: "No encontrada" }, { status: 404 });

  void auditAgendaAction({
    tenantId: ctx.tenantId,
    userId: ctx.userId,
    userEmail: ctx.userEmail,
    action: "cancelled",
    visitaId: id,
    meta: { title: result.visita.title },
    request,
  });

  return NextResponse.json(result);
}
