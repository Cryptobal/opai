/**
 * API Route: /api/portal/cliente/tickets/[id]
 * GET — Fetch a single ticket with public comments.
 */

import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { requirePortalClienteAuth } from "@/lib/portal-cliente";

export async function GET(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const session = await requirePortalClienteAuth(request);
    if (!session) {
      return NextResponse.json(
        { success: false, error: "No autorizado" },
        { status: 401 }
      );
    }

    const { id } = await params;

    // SEGURIDAD: filtramos por tenantId+source desde el findFirst para evitar
    // que un cliente acceda a tickets de otro tenant o a tickets internos (soporte
    // interno, supervisión, etc.) que no fueron creados desde el portal cliente.
    const ticket = await prisma.opsTicket.findFirst({
      where: {
        id,
        tenantId: session.tenantId,
        source: "portal_cliente",
      },
      select: {
        id: true,
        tenantId: true,
        code: true,
        status: true,
        priority: true,
        title: true,
        description: true,
        assignedTeam: true,
        installationId: true,
        source: true,
        slaDueAt: true,
        resolvedAt: true,
        closedAt: true,
        tags: true,
        createdAt: true,
        ticketType: {
          select: { name: true, slug: true },
        },
        comments: {
          where: { isInternal: false },
          select: {
            id: true,
            userId: true,
            body: true,
            isInternal: true,
            attachments: true,
            createdAt: true,
          },
          orderBy: { createdAt: "asc" },
        },
      },
    });

    if (!ticket) {
      return NextResponse.json(
        { success: false, error: "Ticket no encontrado" },
        { status: 404 }
      );
    }

    // Para tickets con instalación, confirmamos en BD que pertenezca a la cuenta.
    // Para tickets sin instalación (raro, pero posible) basta con tenant+source ya
    // validados arriba.
    if (ticket.installationId) {
      const inst = await prisma.crmInstallation.findFirst({
        where: {
          id: ticket.installationId,
          accountId: session.accountId,
          tenantId: session.tenantId,
        },
        select: { id: true },
      });
      if (!inst) {
        return NextResponse.json(
          { success: false, error: "Acceso no autorizado" },
          { status: 403 }
        );
      }
    }

    const { tenantId: _tenantId, ...safeTicket } = ticket;
    return NextResponse.json({ success: true, data: safeTicket });
  } catch (error) {
    console.error("[Portal Cliente] ticket GET [id] error:", error);
    return NextResponse.json(
      { success: false, error: "Error interno" },
      { status: 500 }
    );
  }
}
