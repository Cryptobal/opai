import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { requireAuth, unauthorized } from "@/lib/api-auth";
import { ensureOpsAccess } from "@/lib/ops";

type Params = { id: string };

/**
 * GET /api/ops/tickets/[id]/events
 * Retorna el audit trail del ticket (cambios de estado, asignación,
 * prioridad, equipo, SLA, aprobaciones, etc.).
 *
 * Multi-tenant: el ticket debe pertenecer al tenant del caller.
 */
export async function GET(
  _request: NextRequest,
  { params }: { params: Promise<Params> },
) {
  try {
    const ctx = await requireAuth();
    if (!ctx) return unauthorized();
    const forbidden = await ensureOpsAccess(ctx);
    if (forbidden) return forbidden;

    const { id: ticketId } = await params;

    const ticket = await prisma.opsTicket.findFirst({
      where: { id: ticketId, tenantId: ctx.tenantId },
      select: { id: true },
    });
    if (!ticket) {
      return NextResponse.json(
        { success: false, error: "Ticket no encontrado" },
        { status: 404 },
      );
    }

    const events = await prisma.opsTicketEvent.findMany({
      where: { ticketId, tenantId: ctx.tenantId },
      orderBy: { createdAt: "desc" },
      take: 200,
    });

    // Resolver nombres de actores con el helper polimórfico.
    const { resolveActorNames } = await import(
      "@/lib/notifications/resolve-actor-name"
    );
    const actorIds = [
      ...new Set(events.map((e) => e.actorId).filter(Boolean) as string[]),
    ];
    const actorMap = await resolveActorNames(ctx.tenantId, actorIds);

    const items = events.map((e) => ({
      id: e.id,
      ticketId: e.ticketId,
      type: e.type,
      actorId: e.actorId,
      actorName: e.actorId
        ? (actorMap.get(e.actorId)?.name ?? null)
        : null,
      data: e.data,
      createdAt:
        e.createdAt instanceof Date ? e.createdAt.toISOString() : e.createdAt,
    }));

    return NextResponse.json({ success: true, data: { items } });
  } catch (error) {
    console.error("[OPS] Error listing ticket events:", error);
    return NextResponse.json(
      { success: false, error: "No se pudo obtener el historial" },
      { status: 500 },
    );
  }
}
