import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { requireAuth, unauthorized } from "@/lib/api-auth";
import { ensureOpsAccess } from "@/lib/ops";
import type { TicketComment } from "@/lib/tickets";

type Params = { id: string };

/* ── Mapper ──────────────────────────────────────────────────── */

function mapComment(c: any): TicketComment {
  return {
    id: c.id,
    ticketId: c.ticketId,
    userId: c.userId,
    userName: null,
    body: c.body,
    isInternal: c.isInternal,
    createdAt: c.createdAt instanceof Date ? c.createdAt.toISOString() : c.createdAt,
  };
}

/* ── GET /api/ops/tickets/[id]/comments ──────────────────────── */

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

    // Verify ticket belongs to tenant
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

    const comments = await prisma.opsTicketComment.findMany({
      where: { ticketId },
      orderBy: { createdAt: "desc" },
    });

    const items: TicketComment[] = comments.map(mapComment);

    return NextResponse.json({ success: true, data: { items } });
  } catch (error) {
    console.error("[OPS] Error listing ticket comments:", error);
    return NextResponse.json(
      { success: false, error: "No se pudo obtener los comentarios" },
      { status: 500 },
    );
  }
}

/* ── POST /api/ops/tickets/[id]/comments ─────────────────────── */

export async function POST(
  request: NextRequest,
  { params }: { params: Promise<Params> },
) {
  try {
    const ctx = await requireAuth();
    if (!ctx) return unauthorized();
    const forbidden = await ensureOpsAccess(ctx);
    if (forbidden) return forbidden;

    const { id: ticketId } = await params;
    const body = await request.json();

    if (!body.body) {
      return NextResponse.json(
        { success: false, error: "body es requerido" },
        { status: 400 },
      );
    }

    // Verify ticket belongs to tenant
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

    const comment = await prisma.opsTicketComment.create({
      data: {
        ticketId,
        userId: ctx.userId,
        body: body.body,
        isInternal: body.isInternal ?? false,
      },
    });

    return NextResponse.json(
      { success: true, data: mapComment(comment) },
      { status: 201 },
    );
  } catch (error) {
    console.error("[OPS] Error adding ticket comment:", error);
    return NextResponse.json(
      { success: false, error: "No se pudo agregar el comentario" },
      { status: 500 },
    );
  }
}
