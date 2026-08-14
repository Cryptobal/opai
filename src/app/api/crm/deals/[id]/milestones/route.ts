/** GET/PUT /api/crm/deals/[id]/milestones — hitos de licitación del negocio. */
import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { requireAgendaAccess } from "@/lib/api-auth-agenda";
import {
  isDealMilestoneKind,
  listDealMilestones,
  milestoneRangeFromPlan,
  upsertDealMilestoneEvent,
} from "@/modules/agenda/deal-milestones";
import type { PlanMilestone } from "@/modules/crm/email/email-to-crm-structure.types";

type Ctx = { params: Promise<{ id: string }> };

async function loadDeal(tenantId: string, dealId: string) {
  return prisma.crmDeal.findFirst({
    where: { id: dealId, tenantId },
    select: { id: true, accountId: true },
  });
}

export async function GET(_request: NextRequest, routeCtx: Ctx) {
  const access = await requireAgendaAccess();
  if (!access.ok) return access.response;
  const { id } = await routeCtx.params;
  const deal = await loadDeal(access.ctx.tenantId, id);
  if (!deal) {
    return NextResponse.json({ error: "Negocio no encontrado" }, { status: 404 });
  }
  const milestones = await listDealMilestones(access.ctx.tenantId, id);
  return NextResponse.json({ milestones });
}

export async function PUT(request: NextRequest, routeCtx: Ctx) {
  const access = await requireAgendaAccess();
  if (!access.ok) return access.response;
  const { id } = await routeCtx.params;
  const deal = await loadDeal(access.ctx.tenantId, id);
  if (!deal) {
    return NextResponse.json({ error: "Negocio no encontrado" }, { status: 404 });
  }

  const body = (await request.json().catch(() => null)) as {
    kind?: string;
    date?: string;
    time?: string;
    durationMin?: number;
    allDay?: boolean;
    participantIds?: unknown;
    externalEmails?: unknown;
  } | null;
  if (!body) {
    return NextResponse.json({ error: "Body inválido" }, { status: 400 });
  }
  const kind = body.kind;
  if (!kind || !isDealMilestoneKind(kind)) {
    return NextResponse.json({ error: "kind inválido" }, { status: 400 });
  }
  const date = typeof body.date === "string" ? body.date.slice(0, 10) : "";
  if (!/^\d{4}-\d{2}-\d{2}$/.test(date)) {
    return NextResponse.json({ error: "Fecha inválida" }, { status: 400 });
  }

  const participantIds = Array.isArray(body.participantIds)
    ? body.participantIds.filter((v): v is string => typeof v === "string")
    : [];
  const externalEmails = Array.isArray(body.externalEmails)
    ? body.externalEmails.filter(
        (e): e is { email: string; name?: string | null } =>
          typeof e === "object" &&
          e !== null &&
          typeof (e as { email?: unknown }).email === "string" &&
          (e as { email: string }).email.includes("@"),
      )
    : [];

  const plan: PlanMilestone = {
    id: `ms-${kind}`,
    kind,
    date,
    time: typeof body.time === "string" && body.time ? body.time : "09:00",
    durationMin: Number(body.durationMin) || 60,
    allDay: body.allDay === true,
    participantIds,
    externalEmails: externalEmails.map((e) => ({
      email: e.email,
      name: e.name ?? undefined,
    })),
    enabled: true,
  };
  const range = milestoneRangeFromPlan(plan);
  if (!range) {
    return NextResponse.json({ error: "Fecha/hora inválida" }, { status: 400 });
  }

  try {
    const result = await upsertDealMilestoneEvent({
      tenantId: access.ctx.tenantId,
      actorUserId: access.ctx.userId,
      dealId: deal.id,
      accountId: deal.accountId,
      kind,
      startAt: range.startAt,
      endAt: range.endAt,
      allDay: range.allDay,
      participantIds,
      externalEmails,
    });
    const milestones = await listDealMilestones(access.ctx.tenantId, id);
    return NextResponse.json({
      ...result,
      milestones,
    });
  } catch (err) {
    const message = err instanceof Error ? err.message : "No se pudo guardar el hito";
    return NextResponse.json({ error: message }, { status: 400 });
  }
}
