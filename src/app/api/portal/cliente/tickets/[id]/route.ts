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

    const ticket = await prisma.opsTicket.findUnique({
      where: { id },
      select: {
        id: true,
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

    // Verify the ticket's installation belongs to this account
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
    } else {
      // Ticket has no installation, check tenantId at minimum
      if (ticket && (ticket as { tenantId?: string }).tenantId !== session.tenantId) {
        return NextResponse.json(
          { success: false, error: "Acceso no autorizado" },
          { status: 403 }
        );
      }
    }

    return NextResponse.json({ success: true, data: ticket });
  } catch (error) {
    console.error("[Portal Cliente] ticket GET [id] error:", error);
    return NextResponse.json(
      { success: false, error: "Error interno" },
      { status: 500 }
    );
  }
}
