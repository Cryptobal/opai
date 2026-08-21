/**
 * API Route: /api/portal/cliente/tickets
 * GET — List tickets for the client's account installations.
 * POST — Create a new ticket from the portal.
 */

import { NextRequest, NextResponse } from "next/server";
import type { Prisma } from "@prisma/client";
import { prisma } from "@/lib/prisma";
import { requirePortalClienteAuth } from "@/lib/portal-cliente";
import { notify } from "@/lib/notifications/notify";
import { normalizeTicketAttachments } from "@/lib/portal-cliente-ticket-attachments";
import { sendClientTicketConfirmationEmail } from "@/lib/tickets-confirmation-email";
import { INCIDENTE_TICKET_SLUG } from "@/lib/incidentes-instalacion/constants";

export async function GET(request: NextRequest) {
  try {
    const session = await requirePortalClienteAuth(request);
    if (!session) {
      return NextResponse.json(
        { success: false, error: "No autorizado" },
        { status: 401 }
      );
    }

    const { searchParams } = request.nextUrl;
    const statusFilter = searchParams.get("status");
    const installationIdFilter = searchParams.get("installationId");

    // Resolve installation IDs authorized for this account
    let installationIds: string[];

    if (installationIdFilter) {
      const inst = await prisma.crmInstallation.findFirst({
        where: {
          id: installationIdFilter,
          accountId: session.accountId,
          tenantId: session.tenantId,
        },
        select: { id: true },
      });
      if (!inst) {
        return NextResponse.json(
          { success: false, error: "Instalacion no encontrada" },
          { status: 404 }
        );
      }
      installationIds = [installationIdFilter];
    } else {
      const installations = await prisma.crmInstallation.findMany({
        where: {
          accountId: session.accountId,
          tenantId: session.tenantId,
        },
        select: { id: true },
      });
      installationIds = installations.map((i) => i.id);
    }

    if (installationIds.length === 0) {
      return NextResponse.json({
        success: true,
        data: [],
        incidentesKpis: { enAtencion: 0, resueltosMes: 0 },
      });
    }

    // El cliente ve tickets que él creó y los incidentes QR públicos de sus
    // instalaciones. Nunca tickets internos (supervisión, guard events, manual).
    const sourceFilter = { in: ["portal_cliente", "public_qr"] as const };
    const monthStart = new Date();
    monthStart.setDate(1);
    monthStart.setHours(0, 0, 0, 0);

    const [tickets, enAtencion, resueltosMes] = await Promise.all([
      prisma.opsTicket.findMany({
        where: {
          tenantId: session.tenantId,
          installationId: { in: installationIds },
          source: sourceFilter,
          ...(statusFilter ? { status: statusFilter } : {}),
        },
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
        },
        orderBy: { createdAt: "desc" },
        take: 50,
      }),
      prisma.opsTicket.count({
        where: {
          tenantId: session.tenantId,
          installationId: { in: installationIds },
          source: sourceFilter,
          ticketType: { slug: INCIDENTE_TICKET_SLUG },
          status: { in: ["open", "in_progress"] },
        },
      }),
      prisma.opsTicket.count({
        where: {
          tenantId: session.tenantId,
          installationId: { in: installationIds },
          source: sourceFilter,
          ticketType: { slug: INCIDENTE_TICKET_SLUG },
          status: { in: ["resolved", "closed"] },
          OR: [{ resolvedAt: { gte: monthStart } }, { closedAt: { gte: monthStart } }],
        },
      }),
    ]);

    return NextResponse.json({
      success: true,
      data: tickets,
      incidentesKpis: { enAtencion, resueltosMes },
    });
  } catch (error) {
    console.error("[Portal Cliente] tickets GET error:", error);
    return NextResponse.json(
      { success: false, error: "Error interno" },
      { status: 500 }
    );
  }
}

export async function POST(request: NextRequest) {
  try {
    const session = await requirePortalClienteAuth(request);
    if (!session) {
      return NextResponse.json(
        { success: false, error: "No autorizado" },
        { status: 401 }
      );
    }

    const body = await request.json();
    const { installationId, title, description, priority, ticketTypeId } = body;
    const attachments = normalizeTicketAttachments(body.attachments);

    if (!installationId || !title) {
      return NextResponse.json(
        { success: false, error: "installationId y title son requeridos" },
        { status: 400 }
      );
    }

    // Verify installationId belongs to session.accountId
    const inst = await prisma.crmInstallation.findFirst({
      where: {
        id: installationId,
        accountId: session.accountId,
        tenantId: session.tenantId,
      },
      select: { id: true },
    });

    if (!inst) {
      return NextResponse.json(
        { success: false, error: "Instalacion no encontrada o sin acceso" },
        { status: 403 }
      );
    }

    // Validate ticketTypeId if provided: must be client-origin and same tenant
    let resolvedTeam = "operaciones";
    let resolvedPriority = priority ?? "p3";
    let resolvedSlaHours: number | null = null;

    if (ticketTypeId) {
      const ticketType = await prisma.opsTicketType.findFirst({
        where: {
          id: ticketTypeId,
          tenantId: session.tenantId,
          isActive: true,
          origin: "client",
        },
        select: { id: true, assignedTeam: true, defaultPriority: true, slaHours: true },
      });
      if (!ticketType) {
        return NextResponse.json(
          { success: false, error: "Tipo de ticket no disponible para el portal" },
          { status: 403 },
        );
      }
      resolvedTeam = ticketType.assignedTeam;
      resolvedPriority = priority ?? ticketType.defaultPriority;
      resolvedSlaHours = ticketType.slaHours;
    }

    const code = `TKT-${Date.now().toString(36).toUpperCase()}`;

    const ticket = await prisma.opsTicket.create({
      data: {
        tenantId: session.tenantId,
        code,
        title,
        description: description ?? null,
        priority: resolvedPriority,
        status: "open",
        assignedTeam: resolvedTeam,
        source: "portal_cliente",
        reportedBy: session.contactId,
        installationId,
        ...(ticketTypeId ? { ticketTypeId } : {}),
        ...(resolvedSlaHours ? { slaDueAt: new Date(Date.now() + resolvedSlaHours * 60 * 60 * 1000) } : {}),
      },
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
        createdAt: true,
        ticketType: {
          select: { name: true, slug: true },
        },
      },
    });

    // Si el cliente envió adjuntos, creamos un comentario inicial público con
    // los archivos en el campo `attachments` (JSON). Así se muestran en el
    // historial del ticket y se notifican al equipo junto con el resto.
    if (attachments.length > 0) {
      try {
        await prisma.opsTicketComment.create({
          data: {
            ticketId: ticket.id,
            userId: session.contactId,
            body: `Adjuntos iniciales (${attachments.length}):\n${attachments
              .map((a) => `• ${a.fileName}`)
              .join("\n")}`,
            isInternal: false,
            attachments: attachments as unknown as Prisma.InputJsonValue,
          },
        });
      } catch (attachErr) {
        console.error(
          "[Portal Cliente] tickets initial attachments error:",
          attachErr
        );
      }
    }

    // Resolve contact name for notification
    let contactName = "Cliente";
    try {
      const contact = await prisma.crmContact.findUnique({
        where: { id: session.contactId },
        select: { firstName: true, lastName: true },
      });
      if (contact) contactName = [contact.firstName, contact.lastName].filter(Boolean).join(" ") || "Cliente";
    } catch { /* non-critical */ }

    // Send confirmation email to client
    try {
      const contact = await prisma.crmContact.findUnique({
        where: { id: session.contactId },
        select: { email: true, firstName: true, lastName: true },
      });
      if (contact?.email) {
        const fullName = [contact.firstName, contact.lastName]
          .filter(Boolean)
          .join(" ");
        await sendClientTicketConfirmationEmail({
          tenantId: session.tenantId,
          contactEmail: contact.email,
          contactName: fullName || null,
          ticketCode: ticket.code,
          ticketId: ticket.id,
          ticketTitle: title,
          ticketDescription: description ?? null,
        });
        if (fullName) contactName = fullName;
      }
    } catch (emailErr) {
      console.error("[Portal Cliente] confirmation email error:", emailErr);
    }

    // Notify internal team
    notify({
      tenantId: session.tenantId,
      type: "ticket_from_client_portal",
      audience: "admin",
      title: `Nuevo ticket desde portal: ${ticket.code}`,
      body: `${contactName} creó el ticket "${ticket.title}"`,
      data: { ticketId: ticket.id, code: ticket.code, contactName },
      link: `/ops/tickets/${ticket.id}`,
    }).catch(() => {});

    return NextResponse.json({ success: true, data: ticket }, { status: 201 });
  } catch (error) {
    console.error("[Portal Cliente] tickets POST error:", error);
    return NextResponse.json(
      { success: false, error: "Error interno" },
      { status: 500 }
    );
  }
}

