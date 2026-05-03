import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { requireAuth, unauthorized } from "@/lib/api-auth";
import { ensureOpsAccess } from "@/lib/ops";

type Params = { id: string };

const VALID_TYPES = [
  "duplicate_of",
  "blocks",
  "blocked_by",
  "relates_to",
  "parent_of",
  "child_of",
] as const;
type LinkType = (typeof VALID_TYPES)[number];

const MIRROR: Partial<Record<LinkType, LinkType>> = {
  blocks: "blocked_by",
  blocked_by: "blocks",
  parent_of: "child_of",
  child_of: "parent_of",
};

const UUID_RE =
  /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;

/**
 * GET /api/ops/tickets/[id]/links — Lista los links del ticket
 * (outgoing + incoming) con título y código del otro ticket. La
 * vista canónica del operador es "los tickets relacionados a este",
 * sin importar la dirección semántica.
 */
export async function GET(
  _req: NextRequest,
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

    // outgoing y incoming. El cliente decide cómo agruparlos.
    const [outgoing, incoming] = await Promise.all([
      prisma.opsTicketLink.findMany({
        where: { sourceTicketId: ticketId, tenantId: ctx.tenantId },
        include: {
          targetTicket: {
            select: {
              id: true,
              code: true,
              title: true,
              status: true,
              priority: true,
            },
          },
        },
        orderBy: { createdAt: "desc" },
      }),
      prisma.opsTicketLink.findMany({
        where: { targetTicketId: ticketId, tenantId: ctx.tenantId },
        include: {
          sourceTicket: {
            select: {
              id: true,
              code: true,
              title: true,
              status: true,
              priority: true,
            },
          },
        },
        orderBy: { createdAt: "desc" },
      }),
    ]);

    const items = [
      ...outgoing.map((l) => ({
        id: l.id,
        direction: "outgoing" as const,
        type: l.type,
        ticket: l.targetTicket,
        createdAt:
          l.createdAt instanceof Date ? l.createdAt.toISOString() : l.createdAt,
      })),
      ...incoming.map((l) => ({
        id: l.id,
        direction: "incoming" as const,
        type: l.type,
        ticket: l.sourceTicket,
        createdAt:
          l.createdAt instanceof Date ? l.createdAt.toISOString() : l.createdAt,
      })),
    ];

    return NextResponse.json({ success: true, data: { items } });
  } catch (error) {
    console.error("[OPS] Error listing ticket links:", error);
    return NextResponse.json(
      { success: false, error: "No se pudieron obtener los tickets relacionados" },
      { status: 500 },
    );
  }
}

/**
 * POST /api/ops/tickets/[id]/links
 * Body: { targetTicketId: string, type: LinkType, targetTicketCode?: string }
 * Si se pasa `targetTicketCode` (ej. TK-202604-0461) en lugar de id,
 * se resuelve por código dentro del tenant.
 */
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

    const type = typeof body.type === "string" ? body.type : "";
    if (!(VALID_TYPES as readonly string[]).includes(type)) {
      return NextResponse.json(
        {
          success: false,
          error: `type inválido. Válidos: ${VALID_TYPES.join(", ")}`,
        },
        { status: 400 },
      );
    }

    const sourceTicket = await prisma.opsTicket.findFirst({
      where: { id: ticketId, tenantId: ctx.tenantId },
      select: { id: true },
    });
    if (!sourceTicket) {
      return NextResponse.json(
        { success: false, error: "Ticket origen no encontrado" },
        { status: 404 },
      );
    }

    // Resolver target por id (UUID) o por código.
    let targetTicketId: string | null = null;
    if (typeof body.targetTicketId === "string" && UUID_RE.test(body.targetTicketId)) {
      const t = await prisma.opsTicket.findFirst({
        where: { id: body.targetTicketId, tenantId: ctx.tenantId },
        select: { id: true },
      });
      targetTicketId = t?.id ?? null;
    } else if (typeof body.targetTicketCode === "string" && body.targetTicketCode.trim()) {
      const t = await prisma.opsTicket.findFirst({
        where: { code: body.targetTicketCode.trim(), tenantId: ctx.tenantId },
        select: { id: true },
      });
      targetTicketId = t?.id ?? null;
    }
    if (!targetTicketId) {
      return NextResponse.json(
        {
          success: false,
          error:
            "No se encontró el ticket destino. Pasa targetTicketId (UUID) o targetTicketCode (ej. TK-...).",
        },
        { status: 404 },
      );
    }
    if (targetTicketId === ticketId) {
      return NextResponse.json(
        { success: false, error: "Un ticket no puede enlazarse a sí mismo" },
        { status: 400 },
      );
    }

    // Crear link + mirror si aplica, todo dentro de un tx.
    const created = await prisma.$transaction(async (tx) => {
      const main = await tx.opsTicketLink.upsert({
        where: {
          sourceTicketId_targetTicketId_type: {
            sourceTicketId: ticketId,
            targetTicketId,
            type,
          },
        },
        create: {
          tenantId: ctx.tenantId,
          sourceTicketId: ticketId,
          targetTicketId,
          type,
          createdById: ctx.userId,
        },
        update: {},
      });
      const mirrorType = MIRROR[type as LinkType];
      if (mirrorType) {
        await tx.opsTicketLink.upsert({
          where: {
            sourceTicketId_targetTicketId_type: {
              sourceTicketId: targetTicketId,
              targetTicketId: ticketId,
              type: mirrorType,
            },
          },
          create: {
            tenantId: ctx.tenantId,
            sourceTicketId: targetTicketId,
            targetTicketId: ticketId,
            type: mirrorType,
            createdById: ctx.userId,
          },
          update: {},
        });
      }
      return main;
    });

    // Audit (best-effort).
    try {
      const { recordTicketEvent } = await import("@/lib/tickets-events");
      await recordTicketEvent({
        tenantId: ctx.tenantId,
        ticketId,
        type: "link_added",
        actorId: ctx.userId,
        data: { targetTicketId, linkType: type },
      });
    } catch {
      // best-effort
    }

    return NextResponse.json({
      success: true,
      data: { id: created.id, type: created.type },
    });
  } catch (error) {
    console.error("[OPS] Error creating ticket link:", error);
    return NextResponse.json(
      { success: false, error: "No se pudo crear el link" },
      { status: 500 },
    );
  }
}

/**
 * DELETE /api/ops/tickets/[id]/links?linkId=<uuid>
 * Borra el link y su mirror si existe.
 */
export async function DELETE(
  request: NextRequest,
  { params }: { params: Promise<Params> },
) {
  try {
    const ctx = await requireAuth();
    if (!ctx) return unauthorized();
    const forbidden = await ensureOpsAccess(ctx);
    if (forbidden) return forbidden;

    const { id: ticketId } = await params;
    const linkId = new URL(request.url).searchParams.get("linkId");
    if (!linkId || !UUID_RE.test(linkId)) {
      return NextResponse.json(
        { success: false, error: "linkId inválido" },
        { status: 400 },
      );
    }

    const link = await prisma.opsTicketLink.findFirst({
      where: { id: linkId, tenantId: ctx.tenantId },
      select: {
        id: true,
        sourceTicketId: true,
        targetTicketId: true,
        type: true,
      },
    });
    if (!link) {
      return NextResponse.json(
        { success: false, error: "Link no encontrado" },
        { status: 404 },
      );
    }
    // Verificar que el ticket actual sea uno de los dos endpoints.
    if (link.sourceTicketId !== ticketId && link.targetTicketId !== ticketId) {
      return NextResponse.json(
        { success: false, error: "Link no pertenece a este ticket" },
        { status: 403 },
      );
    }

    await prisma.$transaction(async (tx) => {
      await tx.opsTicketLink.delete({ where: { id: link.id } });
      const mirrorType = MIRROR[link.type as LinkType];
      if (mirrorType) {
        await tx.opsTicketLink.deleteMany({
          where: {
            tenantId: ctx.tenantId,
            sourceTicketId: link.targetTicketId,
            targetTicketId: link.sourceTicketId,
            type: mirrorType,
          },
        });
      }
    });

    try {
      const { recordTicketEvent } = await import("@/lib/tickets-events");
      await recordTicketEvent({
        tenantId: ctx.tenantId,
        ticketId,
        type: "link_removed",
        actorId: ctx.userId,
        data: {
          targetTicketId:
            link.sourceTicketId === ticketId
              ? link.targetTicketId
              : link.sourceTicketId,
          linkType: link.type,
        },
      });
    } catch {
      // best-effort
    }

    return NextResponse.json({ success: true });
  } catch (error) {
    console.error("[OPS] Error deleting ticket link:", error);
    return NextResponse.json(
      { success: false, error: "No se pudo eliminar el link" },
      { status: 500 },
    );
  }
}
