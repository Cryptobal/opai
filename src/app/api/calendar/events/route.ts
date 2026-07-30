import { NextRequest, NextResponse } from "next/server";
import { requireAgendaAccess } from "@/lib/api-auth-agenda";
import { auditAgendaAction } from "@/lib/audit-productividad";
import { dateAtChileSlot } from "@/components/agenda/agenda-calendar-utils";
import { createAgendaEventWithPeople } from "@/modules/agenda/deal-milestones";

const LEGACY_TYPES = new Set(["cliente", "supervision", "otra"]);

/**
 * POST /api/calendar/events — creación desde el composer móvil (B12).
 * Crea la visita legacy + participantes; sync Google por UN solo camino
 * (vía createAgendaEventWithPeople, compartido con hitos del Plan).
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
    void auditAgendaAction({
      tenantId: ctx.tenantId,
      userId: ctx.userId,
      userEmail: ctx.userEmail,
      action: "created",
      visitaId: result.visita.id,
      meta: { title: "Visita técnica", type: "tecnica" },
      request,
    });
    return NextResponse.json(
      { visita: result.visita, syncStatus: result.sync.syncStatus },
      { status: 201 },
    );
  }

  const { visita, syncStatus } = await createAgendaEventWithPeople({
    tenantId: ctx.tenantId,
    actorUserId: typeof body.ownerId === "string" ? body.ownerId : ctx.userId,
    type: type as "cliente" | "supervision" | "otra",
    title: String(body.title || "Nuevo evento"),
    accountId: body.accountId ?? null,
    installationId: body.installationId ?? null,
    dealId: body.dealId ?? null,
    startAt,
    endAt,
    allDay,
    notes: body.notes ?? null,
    customAddress: body.customAddress ?? null,
    participantIds,
    externalEmails: externals,
    syncGoogle: body.syncGoogle !== false,
    notifyOpai: body.notifyOpai !== false,
  });

  void auditAgendaAction({
    tenantId: ctx.tenantId,
    userId: ctx.userId,
    userEmail: ctx.userEmail,
    action: "created",
    visitaId: visita.id,
    meta: { title: visita.title, type: visita.type },
    request,
  });

  return NextResponse.json({ visita, syncStatus }, { status: 201 });
}
