import { NextRequest, NextResponse } from "next/server";
import { requireAgendaAccess } from "@/lib/api-auth-agenda";
import {
  createAgendaVisita,
  createVisitaTecnicaFromAgenda,
} from "@/modules/agenda/agenda.service";

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
  const { listAgenda } = await import("@/modules/agenda/agenda.service");
  const items = await listAgenda(ctx.tenantId, new Date(from), new Date(to));
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
    if (!body.accountId || !body.installationId) {
      return NextResponse.json(
        { error: "Visita técnica requiere accountId e installationId" },
        { status: 400 },
      );
    }
    const result = await createVisitaTecnicaFromAgenda({
      tenantId: ctx.tenantId,
      assignedUserId: body.assignedUserId,
      accountId: body.accountId,
      installationId: body.installationId,
      dealId: body.dealId ?? null,
      startAt,
      notes: body.notes ?? null,
    });
    return NextResponse.json(result, { status: 201 });
  }

  if (!["cliente", "supervision", "otra"].includes(type)) {
    return NextResponse.json({ error: "Tipo inválido" }, { status: 400 });
  }

  const result = await createAgendaVisita({
    tenantId: ctx.tenantId,
    createdBy: ctx.userId,
    type: type as "cliente" | "supervision" | "otra",
    title: body.title || `Visita ${type}`,
    accountId: body.accountId ?? null,
    installationId: body.installationId ?? null,
    dealId: body.dealId ?? null,
    assignedUserId: body.assignedUserId,
    startAt,
    endAt,
    notes: body.notes ?? null,
    customAddress: body.customAddress ?? null,
    lat: typeof body.lat === "number" ? body.lat : null,
    lng: typeof body.lng === "number" ? body.lng : null,
    contactIds: body.contactIds ?? null,
    syncCalendar: body.syncCalendar,
    inviteContacts: body.inviteContacts,
  });
  return NextResponse.json(result, { status: 201 });
}
