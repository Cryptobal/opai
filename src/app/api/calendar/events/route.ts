import { NextRequest, NextResponse } from "next/server";
import { requireAgendaAccess } from "@/lib/api-auth-agenda";
import { auditAgendaAction } from "@/lib/audit-productividad";
import { scheduleFromFormParts } from "@/components/agenda/nueva-visita/visita-form-utils";
import {
  createOpaiEvent,
  OpaiEventValidationError,
} from "@/modules/calendar/calendar-write";

const LEGACY_TYPES = new Set(["cliente", "supervision", "otra"]);

/**
 * POST /api/calendar/events — único punto de creación de eventos OPAI.
 */
export async function POST(request: NextRequest) {
  const access = await requireAgendaAccess();
  if (!access.ok) return access.response;
  const { ctx } = access;

  const body = await request.json();
  const rawType = String(body.type ?? "otra");
  const type = rawType === "reunion" ? "otra" : rawType;
  if (type === "tecnica") {
    return NextResponse.json(
      {
        error:
          "Las visitas técnicas de supervisor se solicitan desde cotización (CPQ), no desde la agenda",
      },
      { status: 400 },
    );
  }
  if (!LEGACY_TYPES.has(type)) {
    return NextResponse.json({ error: "Tipo inválido" }, { status: 400 });
  }

  const date = String(body.date ?? "");
  const hasIso =
    typeof body.startAt === "string" && !Number.isNaN(new Date(body.startAt).getTime());

  let startAt: Date;
  let endAt: Date;
  let allDay = body.allDay === true;

  if (hasIso) {
    startAt = new Date(body.startAt);
    endAt = body.endAt
      ? new Date(body.endAt)
      : new Date(startAt.getTime() + 60 * 60_000);
  } else {
    const schedule = scheduleFromFormParts({
      date,
      endDate: typeof body.endDate === "string" ? body.endDate : date,
      time: typeof body.time === "string" ? body.time : "09:00",
      allDay,
      durationMin: Number(body.durationMin) || 60,
    });
    if (!schedule) {
      return NextResponse.json({ error: "Fecha/hora inválida" }, { status: 400 });
    }
    startAt = schedule.startAt;
    endAt = schedule.endAt;
  }

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
  const contactIds: string[] = Array.isArray(body.contactIds)
    ? body.contactIds.filter((v: unknown): v is string => typeof v === "string")
    : [];

  try {
    const result = await createOpaiEvent({
      tenantId: ctx.tenantId,
      actorUserId: ctx.userId,
      type: type as "cliente" | "supervision" | "otra",
      title: String(body.title || "Nuevo evento"),
      label: typeof body.label === "string" ? body.label : null,
      assignedUserId:
        (typeof body.assignedUserId === "string" && body.assignedUserId.trim()) ||
        (typeof body.ownerId === "string" && body.ownerId.trim()) ||
        ctx.userId,
      startAt,
      endAt,
      allDay,
      notes: body.notes ?? null,
      address: body.customAddress ?? body.address ?? null,
      lat: typeof body.lat === "number" ? body.lat : null,
      lng: typeof body.lng === "number" ? body.lng : null,
      accountId: body.accountId ?? null,
      installationId: body.installationId ?? null,
      dealId: body.dealId ?? null,
      participantIds,
      externalEmails: externals,
      contactIds,
      syncGoogle: body.syncGoogle !== false && body.syncCalendar !== false,
      notifyOpai: body.notifyOpai !== false,
      slackReminderPrevDay: body.slackReminderPrevDay === true,
    });

    void auditAgendaAction({
      tenantId: ctx.tenantId,
      userId: ctx.userId,
      userEmail: ctx.userEmail,
      action: "created",
      visitaId: result.eventId,
      meta: { title: result.visita.title, type: result.visita.type, label: result.visita.label },
      request,
    });

    return NextResponse.json(
      {
        visita: result.visita,
        syncStatus: result.syncStatus,
        htmlLink: result.htmlLink,
        eventId: result.eventId,
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
