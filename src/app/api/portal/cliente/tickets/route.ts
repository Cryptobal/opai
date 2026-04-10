/**
 * API Route: /api/portal/cliente/tickets
 * GET — List tickets for the client's account installations.
 * POST — Create a new ticket from the portal.
 */

import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { getClientSession } from "@/lib/portal-chat-auth";
import { sendNotification, sendNotificationToUser } from "@/lib/notification-service";
import { resend, getTenantEmailConfig } from "@/lib/resend";

export async function GET(request: NextRequest) {
  try {
    const session = getClientSession(request);
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
      return NextResponse.json({ success: true, data: [] });
    }

    const tickets = await prisma.opsTicket.findMany({
      where: {
        tenantId: session.tenantId,
        installationId: { in: installationIds },
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
    });

    return NextResponse.json({ success: true, data: tickets });
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
    const session = getClientSession(request);
    if (!session) {
      return NextResponse.json(
        { success: false, error: "No autorizado" },
        { status: 401 }
      );
    }

    const body = await request.json();
    const { installationId, title, description, priority, ticketTypeId } = body;

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
        const emailCfg = await getTenantEmailConfig(session.tenantId);
        const siteUrl = process.env.NEXT_PUBLIC_APP_URL || process.env.VERCEL_URL ? `https://${process.env.VERCEL_URL}` : "https://opai.cl";
        const portalLink = `${siteUrl}/portal/cliente?section=tickets`;
        const inboundDomain = process.env.TICKETS_INBOUND_DOMAIN || "reply.opai.cl";
        const replyToAlias = `tickets+${ticket.id}@${inboundDomain}`;

        await resend.emails.send({
          from: emailCfg.from,
          to: contact.email,
          replyTo: replyToAlias,
          subject: `[${ticket.code}] Hemos recibido tu solicitud: ${title}`,
          html: buildTicketConfirmationHtml({
            code: ticket.code,
            title,
            description: description ?? null,
            logoUrl: emailCfg.logoUrl,
            companyName: emailCfg.companyName,
            contactName: [contact.firstName, contact.lastName].filter(Boolean).join(" ") || "Estimado/a cliente",
            portalLink,
          }),
        });
        contactName = [contact.firstName, contact.lastName].filter(Boolean).join(" ") || "Cliente";
      }
    } catch (emailErr) {
      console.error("[Portal Cliente] confirmation email error:", emailErr);
    }

    // Notify internal team
    sendNotification({
      tenantId: session.tenantId,
      type: "ticket_from_client_portal",
      title: `Nuevo ticket desde portal: ${ticket.code}`,
      message: `${contactName} creó el ticket "${ticket.title}"`,
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

/* ── HTML builder for ticket confirmation email ──────────── */

function escapeHtml(str: string): string {
  return str.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;").replace(/"/g, "&quot;");
}

function buildTicketConfirmationHtml(opts: {
  code: string;
  title: string;
  description: string | null;
  logoUrl: string;
  companyName: string;
  contactName: string;
  portalLink: string;
}): string {
  return `<!DOCTYPE html>
<html lang="es">
<head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1.0"></head>
<body style="margin:0;padding:0;background:#0c1222;font-family:-apple-system,BlinkMacSystemFont,'Segoe UI',Roboto,sans-serif;">
<div style="max-width:560px;margin:0 auto;padding:32px 16px;">
  ${opts.logoUrl ? `<img src="${escapeHtml(opts.logoUrl)}" alt="${escapeHtml(opts.companyName)}" style="height:32px;margin-bottom:24px;" />` : `<p style="color:#f1f5f9;font-size:18px;font-weight:700;margin:0 0 24px;">${escapeHtml(opts.companyName)}</p>`}
  <div style="background:#111827;border:1px solid #1e293b;border-radius:12px;padding:24px;">
    <p style="color:#f1f5f9;font-size:16px;margin:0 0 8px;">Hola ${escapeHtml(opts.contactName)},</p>
    <p style="color:#94a3b8;font-size:14px;line-height:1.6;margin:0 0 20px;">
      Hemos recibido tu solicitud y se ha creado el ticket <strong style="color:#f1f5f9;">${escapeHtml(opts.code)}</strong>.
    </p>
    <div style="background:#0c1222;border:1px solid #1e293b;border-radius:8px;padding:16px;margin:0 0 20px;">
      <p style="color:#94a3b8;font-size:11px;text-transform:uppercase;letter-spacing:0.05em;margin:0 0 4px;">Ticket</p>
      <p style="color:#f1f5f9;font-size:14px;font-weight:600;margin:0 0 8px;">${escapeHtml(opts.code)} — ${escapeHtml(opts.title)}</p>
      ${opts.description ? `<p style="color:#94a3b8;font-size:13px;margin:0;line-height:1.5;">${escapeHtml(opts.description).substring(0, 300)}</p>` : ""}
    </div>
    <p style="color:#94a3b8;font-size:14px;line-height:1.6;margin:0 0 20px;">
      Puedes hacer seguimiento del estado y agregar comentarios desde el portal.
    </p>
    <a href="${escapeHtml(opts.portalLink)}" style="display:inline-block;background:#3b82f6;color:#fff;text-decoration:none;padding:10px 24px;border-radius:8px;font-size:14px;font-weight:500;">
      Ver en el portal
    </a>
  </div>
  <p style="color:#475569;font-size:11px;text-align:center;margin:24px 0 0;">
    ${escapeHtml(opts.companyName)} — Este es un email automático, puedes responder directamente a este correo.
  </p>
</div>
</body>
</html>`;
}
