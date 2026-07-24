import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import {
  requireAgendaAccess,
  canMutateVisita,
  visitaForbidden,
} from "@/lib/api-auth-agenda";
import { auditAgendaAction } from "@/lib/audit-productividad";
import {
  cancelAgendaVisita,
  completeAgendaVisita,
  reprogramAgendaVisita,
} from "@/modules/agenda/agenda.service";

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
    const { isCalendarV2Enabled } = await import("@/modules/calendar/calendar-flags");
    if (isCalendarV2Enabled()) {
      const { getCalendarEventDetail } = await import("@/modules/calendar/calendar-detail");
      v2 = await getCalendarEventDetail(ctx.tenantId, id);
    }
  } catch {
    v2 = null;
  }

  return NextResponse.json({
    visita,
    syncStatus: link?.syncStatus ?? "PENDING",
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
  if (!canMutateVisita(ctx, existing)) return visitaForbidden();

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
    });
    return NextResponse.json(result);
  }

  if (body.startAt && body.endAt) {
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
    });
    return NextResponse.json(result);
  }

  return NextResponse.json({ error: "Acción no soportada" }, { status: 400 });
}

export async function DELETE(_req: NextRequest, routeCtx: Ctx) {
  const access = await requireAgendaAccess();
  if (!access.ok) return access.response;
  const { ctx } = access;
  const { id } = await routeCtx.params;

  const existing = await loadOwnedVisita(ctx.tenantId, id);
  if (!existing) return NextResponse.json({ error: "No encontrada" }, { status: 404 });
  if (!canMutateVisita(ctx, existing)) return visitaForbidden();

  const result = await cancelAgendaVisita(ctx.tenantId, id);
  if (!result) return NextResponse.json({ error: "No encontrada" }, { status: 404 });
  void auditAgendaAction({
    tenantId: ctx.tenantId,
    userId: ctx.userId,
    userEmail: ctx.userEmail,
    action: "cancelled",
    visitaId: id,
    meta: { title: result.visita.title },
  });
  return NextResponse.json(result);
}
