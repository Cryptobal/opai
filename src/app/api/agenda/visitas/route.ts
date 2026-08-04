import { NextRequest, NextResponse } from "next/server";
import { requireAgendaAccess } from "@/lib/api-auth-agenda";
import { auditAgendaAction } from "@/lib/audit-productividad";
import {
  createOpaiEvent,
  OpaiEventValidationError,
} from "@/modules/calendar/calendar-write";

export async function GET(request: NextRequest) {
  const access = await requireAgendaAccess();
  if (!access.ok) return access.response;
  const { ctx } = access;
  const { searchParams } = new URL(request.url);
  const from = searchParams.get("from");
  const to = searchParams.get("to");
  if (!from || !to) {
    return NextResponse.json({ error: "from y to requeridos" }, { status: 400 });
  }
  const dealId = searchParams.get("dealId");
  const { listAgenda } = await import("@/modules/agenda/agenda.service");
  const items = await listAgenda(
    ctx.tenantId,
    new Date(from),
    new Date(to),
    undefined,
    dealId ? { dealId } : undefined,
  );
  return NextResponse.json({
    items: items.filter((i) => i.source !== "licitacion"),
  });
}

export async function POST(request: NextRequest) {
  const access = await requireAgendaAccess();
  if (!access.ok) return access.response;
  const { ctx } = access;

  const body = await request.json();
  const type = body.type as string;
  const startAt = new Date(body.startAt);
  const endAt = body.endAt
    ? new Date(body.endAt)
    : new Date(startAt.getTime() + 60 * 60_000);

  if (!type || !body.assignedUserId || Number.isNaN(startAt.getTime())) {
    return NextResponse.json({ error: "Datos incompletos" }, { status: 400 });
  }

  if (type === "tecnica") {
    return NextResponse.json(
      {
        error:
          "Las visitas técnicas de supervisor se solicitan desde cotización (CPQ), no desde la agenda",
      },
      { status: 400 },
    );
  }

  if (!["cliente", "supervision", "otra"].includes(type)) {
    return NextResponse.json({ error: "Tipo inválido" }, { status: 400 });
  }

  try {
    const result = await createOpaiEvent({
      tenantId: ctx.tenantId,
      actorUserId: ctx.userId,
      type: type as "cliente" | "supervision" | "otra",
      title: body.title || `Visita ${type}`,
      label: typeof body.label === "string" ? body.label : null,
      assignedUserId: body.assignedUserId,
      startAt,
      endAt,
      allDay: body.allDay === true,
      notes: body.notes ?? null,
      address: body.customAddress ?? body.address ?? null,
      lat: typeof body.lat === "number" ? body.lat : null,
      lng: typeof body.lng === "number" ? body.lng : null,
      accountId: body.accountId ?? null,
      installationId: body.installationId ?? null,
      dealId: body.dealId ?? null,
      participantIds: Array.isArray(body.participantIds) ? body.participantIds : [],
      externalEmails: Array.isArray(body.externalEmails) ? body.externalEmails : [],
      contactIds: Array.isArray(body.contactIds) ? body.contactIds : [],
      syncGoogle: body.syncCalendar !== false && body.syncGoogle !== false,
      notifyOpai: body.notifyOpai !== false,
      slackReminderPrevDay: body.slackReminderPrevDay === true,
    });

    void auditAgendaAction({
      tenantId: ctx.tenantId,
      userId: ctx.userId,
      userEmail: ctx.userEmail,
      action: "created",
      visitaId: result.eventId,
      meta: { title: result.visita.title, type: result.visita.type },
      request,
    });

    // Forma de respuesta legacy para no romper consumidores.
    return NextResponse.json(
      {
        visita: result.visita,
        sync: { syncStatus: result.syncStatus },
        syncStatus: result.syncStatus,
        htmlLink: result.htmlLink,
      },
      { status: 201 },
    );
  } catch (err) {
    if (err instanceof OpaiEventValidationError) {
      return NextResponse.json({ error: err.message }, { status: 400 });
    }
    throw err;
  }
}
