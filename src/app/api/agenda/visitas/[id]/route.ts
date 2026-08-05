import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import {
  requireAgendaAccess,
  canMutateVisita,
  visitaForbidden,
  loadParticipantRolesForActor,
} from "@/lib/api-auth-agenda";
import { auditAgendaAction } from "@/lib/audit-productividad";
import {
  cancelAgendaVisita,
  completeAgendaVisita,
  reprogramAgendaVisita,
} from "@/modules/agenda/agenda.service";
import { sanitizeSyncReason } from "@/modules/agenda/agenda-sync-reason";
import {
  OpaiEventValidationError,
  updateOpaiEvent,
} from "@/modules/calendar/calendar-write";

type Ctx = { params: Promise<{ id: string }> };

export async function GET(_req: NextRequest, routeCtx: Ctx) {
  const access = await requireAgendaAccess();
  if (!access.ok) return access.response;
  const { ctx } = access;
  const { id } = await routeCtx.params;
  const visita = await prisma.agendaVisita.findFirst({
    where: { id, tenantId: ctx.tenantId },
    include: {
      account: { select: { id: true, name: true } },
      installation: { select: { id: true, name: true, address: true, lat: true, lng: true } },
      deal: { select: { id: true, title: true } },
    },
  });
  if (!visita) return NextResponse.json({ error: "No encontrada" }, { status: 404 });

  const link = await prisma.agendaEventLink.findUnique({
    where: { sourceType_sourceId: { sourceType: "agenda_visita", sourceId: id } },
  });

  // Detalle v2 (participantes + RSVP) si el espejo existe; best-effort.
  let v2 = null;
  try {
    const { getCalendarEventDetail } = await import("@/modules/calendar/calendar-detail");
    v2 = await getCalendarEventDetail(ctx.tenantId, id);
  } catch {
    v2 = null;
  }

  return NextResponse.json({
    visita,
    syncStatus: link?.syncStatus ?? null,
    syncReason: sanitizeSyncReason(link?.lastError),
    htmlLink: link?.htmlLink ?? null,
    v2,
  });
}

async function loadOwnedVisita(tenantId: string, id: string) {
  return prisma.agendaVisita.findFirst({
    where: { id, tenantId },
    select: { id: true, createdBy: true, assignedUserId: true, dealId: true },
  });
}

export async function PATCH(request: NextRequest, routeCtx: Ctx) {
  const access = await requireAgendaAccess();
  if (!access.ok) return access.response;
  const { ctx } = access;
  const { id } = await routeCtx.params;
  const body = await request.json();
  const tenantId = ctx.tenantId;

  const existing = await loadOwnedVisita(tenantId, id);
  if (!existing) return NextResponse.json({ error: "No encontrada" }, { status: 404 });
  const participantRoles = await loadParticipantRolesForActor(tenantId, id, ctx.userId);
  if (!canMutateVisita(ctx, { ...existing, participantRoles })) return visitaForbidden();

  if (body.action === "complete") {
    const result = await completeAgendaVisita(tenantId, id, body.resultNote ?? "");
    if (!result) return NextResponse.json({ error: "No encontrada" }, { status: 404 });

    void auditAgendaAction({
      tenantId,
      userId: ctx.userId,
      userEmail: ctx.userEmail,
      action: "completed",
      visitaId: id,
      meta: { title: result.visita.title },
      request,
    });

    // Nota en timeline CRM si hay deal
    if (result.visita.dealId && body.resultNote) {
      try {
        const { createCrmHistoryLog } = await import("@/lib/crm-history");
        await createCrmHistoryLog({
          tenantId,
          entityType: "deal",
          entityId: result.visita.dealId,
          action: "visita_completada",
          details: { resultNote: body.resultNote, visitaId: id },
          createdBy: ctx.userId,
        });
      } catch {
        // history es best-effort
      }
    }
    return NextResponse.json(result);
  }

  if (body.action === "cancel") {
    const result = await cancelAgendaVisita(tenantId, id);
    if (!result) return NextResponse.json({ error: "No encontrada" }, { status: 404 });
    void auditAgendaAction({
      tenantId,
      userId: ctx.userId,
      userEmail: ctx.userEmail,
      action: "cancelled",
      visitaId: id,
      meta: { title: result.visita.title },
      request,
    });
    return NextResponse.json(result);
  }

  // Reprogramación rápida (solo fechas / responsable).
  if (
    body.startAt &&
    body.endAt &&
    body.title === undefined &&
    body.label === undefined &&
    body.participantIds === undefined &&
    body.externalEmails === undefined &&
    body.customAddress === undefined &&
    body.address === undefined &&
    body.notes === undefined
  ) {
    const result = await reprogramAgendaVisita(
      tenantId,
      id,
      new Date(body.startAt),
      new Date(body.endAt),
      typeof body.assignedUserId === "string" ? body.assignedUserId : undefined,
    );
    if (!result) return NextResponse.json({ error: "No encontrada" }, { status: 404 });
    void auditAgendaAction({
      tenantId,
      userId: ctx.userId,
      userEmail: ctx.userEmail,
      action: "reprogrammed",
      visitaId: id,
      meta: {
        title: result.visita.title,
        startAt: body.startAt,
        endAt: body.endAt,
      },
      request,
    });
    return NextResponse.json(result);
  }

  // Patch completo → servicio único.
  try {
    const result = await updateOpaiEvent(
      tenantId,
      id,
      {
        title: typeof body.title === "string" ? body.title : undefined,
        label: body.label !== undefined ? body.label : undefined,
        assignedUserId:
          typeof body.assignedUserId === "string" ? body.assignedUserId : undefined,
        startAt: body.startAt ? new Date(body.startAt) : undefined,
        endAt: body.endAt ? new Date(body.endAt) : undefined,
        allDay: body.allDay === true ? true : body.allDay === false ? false : undefined,
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
        syncGoogle: body.syncCalendar !== false && body.syncGoogle !== false,
        slackReminderPrevDay:
          body.slackReminderPrevDay !== undefined
            ? body.slackReminderPrevDay === true
            : undefined,
      },
      ctx.userId,
    );
    if (!result) return NextResponse.json({ error: "No encontrada" }, { status: 404 });
    void auditAgendaAction({
      tenantId,
      userId: ctx.userId,
      userEmail: ctx.userEmail,
      action: "reprogrammed",
      visitaId: id,
      meta: { title: result.visita.title, via: "full_patch" },
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

  const existing = await loadOwnedVisita(ctx.tenantId, id);
  if (!existing) return NextResponse.json({ error: "No encontrada" }, { status: 404 });
  const deleteRoles = await loadParticipantRolesForActor(ctx.tenantId, id, ctx.userId);
  if (!canMutateVisita(ctx, { ...existing, participantRoles: deleteRoles })) {
    return visitaForbidden();
  }

  const result = await cancelAgendaVisita(ctx.tenantId, id);
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
