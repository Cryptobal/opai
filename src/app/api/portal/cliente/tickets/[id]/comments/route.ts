/**
 * API Route: /api/portal/cliente/tickets/[id]/comments
 * POST — Add a public comment (con adjuntos opcionales) a un ticket del cliente.
 *
 * Hardening (PR5):
 *  - `findFirst` con `tenantId` + `source: "portal_cliente"` para evitar que
 *    el cliente comente tickets internos.
 *  - Adjuntos se validan y normalizan con `normalizeTicketAttachments` — solo
 *    los campos permitidos llegan a Prisma.
 */

import { NextRequest, NextResponse } from "next/server";
import type { Prisma } from "@prisma/client";
import { prisma } from "@/lib/prisma";
import { requirePortalClienteAuth } from "@/lib/portal-cliente";
import { sendNotification, sendNotificationToUser } from "@/lib/notification-service";
import { normalizeTicketAttachments } from "@/lib/portal-cliente-ticket-attachments";

export async function POST(
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
    const body = await request.json();
    const commentBody: unknown = body?.body;
    const attachments = normalizeTicketAttachments(body?.attachments);

    const bodyText =
      typeof commentBody === "string" ? commentBody.trim() : "";

    // Permitimos comentario "vacío" solo si el cliente adjuntó archivos.
    if (!bodyText && attachments.length === 0) {
      return NextResponse.json(
        { success: false, error: "Debes escribir un mensaje o adjuntar un archivo" },
        { status: 400 }
      );
    }

    const ticket = await prisma.opsTicket.findFirst({
      where: {
        id,
        tenantId: session.tenantId,
        source: "portal_cliente",
      },
      select: {
        id: true,
        installationId: true,
        code: true,
        title: true,
        assignedTo: true,
        assignedTeam: true,
      },
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
        body: bodyText || `Archivos adjuntos (${attachments.length})`,
        isInternal: false,
        ...(attachments.length > 0
          ? { attachments: attachments as unknown as Prisma.InputJsonValue }
          : {}),
      },
      select: {
        id: true,
        ticketId: true,
        userId: true,
        body: true,
        isInternal: true,
        attachments: true,
        createdAt: true,
      },
    });

    let contactName = "Cliente";
    try {
      const contact = await prisma.crmContact.findUnique({
        where: { id: session.contactId },
        select: { firstName: true, lastName: true },
      });
      if (contact)
        contactName =
          [contact.firstName, contact.lastName].filter(Boolean).join(" ") ||
          "Cliente";
    } catch {
      /* non-critical */
    }

    sendNotification({
      tenantId: session.tenantId,
      type: "ticket_from_client_portal",
      title: `Comentario en ticket ${ticket.code}`,
      message: `${contactName} comentó en "${ticket.title}"${
        attachments.length > 0 ? ` (${attachments.length} adjunto/s)` : ""
      }`,
      data: { ticketId: id, code: ticket.code, contactName },
      link: `/ops/tickets/${id}`,
    }).catch(() => {});

    if (ticket.assignedTo) {
      sendNotificationToUser({
        tenantId: session.tenantId,
        type: "ticket_from_client_portal",
        title: `Comentario de cliente en ${ticket.code}`,
        message: `${contactName} comentó en "${ticket.title}"`,
        data: { ticketId: id, code: ticket.code, contactName },
        link: `/ops/tickets/${id}`,
        targetUserId: ticket.assignedTo,
      }).catch(() => {});
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
