/**
 * API Route: /api/portal/cliente/tickets/[id]/comments
 * POST — Add a public comment to a ticket.
 */

import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { getClientSession } from "@/lib/portal-chat-auth";
import { sendNotification, sendNotificationToUser } from "@/lib/notification-service";

export async function POST(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const session = getClientSession(request);
    if (!session) {
      return NextResponse.json(
        { success: false, error: "No autorizado" },
        { status: 401 }
      );
    }

    const { id } = await params;
    const body = await request.json();
    const { body: commentBody } = body;

    if (!commentBody || typeof commentBody !== "string" || !commentBody.trim()) {
      return NextResponse.json(
        { success: false, error: "El comentario no puede estar vacio" },
        { status: 400 }
      );
    }

    // Fetch ticket and verify ownership
    const ticket = await prisma.opsTicket.findUnique({
      where: { id },
      select: { id: true, installationId: true },
    });

    if (!ticket) {
      return NextResponse.json(
        { success: false, error: "Ticket no encontrado" },
        { status: 404 }
      );
    }

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

    const comment = await prisma.opsTicketComment.create({
      data: {
        ticketId: id,
        userId: session.contactId,
        body: commentBody.trim(),
        isInternal: false,
      },
      select: {
        id: true,
        ticketId: true,
        userId: true,
        body: true,
        isInternal: true,
        createdAt: true,
      },
    });

    // Notify internal team about new client comment
    const fullTicket = await prisma.opsTicket.findUnique({
      where: { id },
      select: { tenantId: true, code: true, title: true, assignedTo: true, assignedTeam: true },
    });

    if (fullTicket) {
      let contactName = "Cliente";
      try {
        const contact = await prisma.crmContact.findUnique({
          where: { id: session.contactId },
          select: { firstName: true, lastName: true },
        });
        if (contact) contactName = [contact.firstName, contact.lastName].filter(Boolean).join(" ") || "Cliente";
      } catch { /* non-critical */ }

      sendNotification({
        tenantId: fullTicket.tenantId,
        type: "ticket_from_client_portal",
        title: `Comentario en ticket ${fullTicket.code}`,
        message: `${contactName} comentó en "${fullTicket.title}"`,
        data: { ticketId: id, code: fullTicket.code, contactName },
        link: `/ops/tickets/${id}`,
      }).catch(() => {});

      // Also notify assignee directly if set
      if (fullTicket.assignedTo) {
        sendNotificationToUser({
          tenantId: fullTicket.tenantId,
          type: "ticket_from_client_portal",
          title: `Comentario de cliente en ${fullTicket.code}`,
          message: `${contactName} comentó en "${fullTicket.title}"`,
          data: { ticketId: id, code: fullTicket.code, contactName },
          link: `/ops/tickets/${id}`,
          targetUserId: fullTicket.assignedTo,
        }).catch(() => {});
      }
    }

    return NextResponse.json({ success: true, data: comment }, { status: 201 });
  } catch (error) {
    console.error("[Portal Cliente] ticket comment POST error:", error);
    return NextResponse.json(
      { success: false, error: "Error interno" },
      { status: 500 }
    );
  }
}
