import { NextRequest, NextResponse } from "next/server";
import { auth } from "@/lib/auth";
import { prisma } from "@/lib/prisma";
import {
  cancelAgendaVisita,
  completeAgendaVisita,
  reprogramAgendaVisita,
} from "@/modules/agenda/agenda.service";

type Ctx = { params: Promise<{ id: string }> };

export async function GET(_req: NextRequest, ctx: Ctx) {
  const session = await auth();
  if (!session?.user?.tenantId) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }
  const { id } = await ctx.params;
  const visita = await prisma.agendaVisita.findFirst({
    where: { id, tenantId: session.user.tenantId },
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

  return NextResponse.json({
    visita,
    syncStatus: link?.syncStatus ?? "PENDING",
    htmlLink: link?.htmlLink ?? null,
  });
}

export async function PATCH(request: NextRequest, ctx: Ctx) {
  const session = await auth();
  if (!session?.user?.tenantId) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }
  const { id } = await ctx.params;
  const body = await request.json();
  const tenantId = session.user.tenantId;

  if (body.action === "complete") {
    const result = await completeAgendaVisita(tenantId, id, body.resultNote ?? "");
    if (!result) return NextResponse.json({ error: "No encontrada" }, { status: 404 });

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
          createdBy: session.user.id,
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
    return NextResponse.json(result);
  }

  if (body.startAt && body.endAt) {
    const result = await reprogramAgendaVisita(
      tenantId,
      id,
      new Date(body.startAt),
      new Date(body.endAt),
    );
    if (!result) return NextResponse.json({ error: "No encontrada" }, { status: 404 });
    return NextResponse.json(result);
  }

  return NextResponse.json({ error: "Acción no soportada" }, { status: 400 });
}

export async function DELETE(_req: NextRequest, ctx: Ctx) {
  const session = await auth();
  if (!session?.user?.tenantId) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }
  const { id } = await ctx.params;
  const result = await cancelAgendaVisita(session.user.tenantId, id);
  if (!result) return NextResponse.json({ error: "No encontrada" }, { status: 404 });
  return NextResponse.json(result);
}
