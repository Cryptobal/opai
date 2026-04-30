import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { generateTicketCode, TICKET_STATUS_CONFIG } from "@/lib/tickets";
import { requirePortalGuardiaAuth } from "@/lib/portal-guardia-auth";
import type { GuardTicket } from "@/lib/guard-portal";

/* ── GET /api/portal/guardia/tickets ───────────────────────── */

export async function GET(request: NextRequest) {
  try {
    const { searchParams } = new URL(request.url);
    const guardiaId = searchParams.get("guardiaId");

    const guardAuth = await requirePortalGuardiaAuth(guardiaId);
    if (!guardAuth) {
      return NextResponse.json(
        { success: false, error: "Guardia no encontrado o inactivo" },
        { status: 401 },
      );
    }

    const tickets = await prisma.opsTicket.findMany({
      where: { guardiaId: guardAuth.guardiaId, tenantId: guardAuth.tenantId },
      include: {
        ticketType: { select: { name: true } },
      },
      orderBy: { createdAt: "desc" },
    });

    const data: GuardTicket[] = tickets.map((t) => ({
      id: t.id,
      code: t.code,
      title: t.title,
      typeName: t.ticketType?.name ?? "Sin tipo",
      status: t.status,
      statusLabel:
        (TICKET_STATUS_CONFIG as Record<string, { label: string }>)[t.status]?.label ?? t.status,
      priority: t.priority,
      createdAt: t.createdAt instanceof Date ? t.createdAt.toISOString() : String(t.createdAt),
      updatedAt: t.updatedAt instanceof Date ? t.updatedAt.toISOString() : String(t.updatedAt),
    }));

    return NextResponse.json({ success: true, data });
  } catch (error) {
    console.error("[Portal Guardia] Tickets GET error:", error);
    return NextResponse.json(
      { success: false, error: "Error al obtener tickets" },
      { status: 500 },
    );
  }
}

/* ── POST /api/portal/guardia/tickets ──────────────────────── */

export async function POST(request: NextRequest) {
  try {
    const body = await request.json();
    const { guardiaId, ticketTypeId, typeSlug, title, description, tenantId } = body as {
      guardiaId?: string;
      ticketTypeId?: string;
      typeSlug?: string;
      title?: string;
      description?: string;
      tenantId?: string;
    };

    if (!guardiaId || (!ticketTypeId && !typeSlug) || !title) {
      return NextResponse.json(
        { success: false, error: "guardiaId, ticketTypeId (o typeSlug) y title son requeridos" },
        { status: 400 },
      );
    }

    const guardAuth = await requirePortalGuardiaAuth(guardiaId);
    if (!guardAuth) {
      return NextResponse.json(
        { success: false, error: "Guardia no encontrado o inactivo" },
        { status: 401 },
      );
    }

    const effectiveTenantId = guardAuth.tenantId;

    // Load ticket type by ID or slug
    const ticketType = await prisma.opsTicketType.findFirst({
      where: ticketTypeId
        ? { id: ticketTypeId, tenantId: effectiveTenantId }
        : { slug: typeSlug, tenantId: effectiveTenantId },
      include: {
        approvalSteps: { orderBy: { stepOrder: "asc" } },
      },
    });

    if (!ticketType) {
      return NextResponse.json(
        { success: false, error: "Tipo de ticket no encontrado" },
        { status: 404 },
      );
    }

    const slaHours = ticketType.slaHours;
    const slaDueAt = new Date(Date.now() + slaHours * 60 * 60 * 1000);
    const needsApproval =
      ticketType.requiresApproval && ticketType.approvalSteps.length > 0;
    const initialStatus = needsApproval ? "pending_approval" : "open";

    const approvalCreateData = needsApproval
      ? ticketType.approvalSteps.map((step) => ({
          stepOrder: step.stepOrder,
          stepLabel: step.label,
          approverType: step.approverType,
          approverGroupId: step.approverGroupId,
          approverUserId: step.approverUserId,
          decision: "pending",
        }))
      : [];

    // Atomic transaction: code generation + ticket + approvals
    const ticket = await prisma.$transaction(async (tx) => {
      const lastTicket = await tx.opsTicket.findFirst({
        where: { tenantId: effectiveTenantId },
        orderBy: { createdAt: "desc" },
        select: { code: true },
      });
      const lastSeq = lastTicket?.code
        ? parseInt(lastTicket.code.split("-").pop() ?? "0", 10)
        : 0;
      const code = generateTicketCode(lastSeq + 1);

      return tx.opsTicket.create({
        data: {
          tenantId: effectiveTenantId,
          code,
          ticketTypeId: ticketType.id,
          status: initialStatus,
          priority: ticketType.defaultPriority,
          title,
          description: description ?? null,
          assignedTeam: ticketType.assignedTeam,
          source: "portal",
          guardiaId: guardAuth.guardiaId,
          reportedBy: guardAuth.guardiaId,
          slaDueAt,
          currentApprovalStep: needsApproval ? 1 : null,
          approvalStatus: needsApproval ? "pending" : null,
          approvals: { create: approvalCreateData },
        },
        include: {
          ticketType: { select: { name: true } },
        },
      });
    });

    const result: GuardTicket = {
      id: ticket.id,
      code: ticket.code,
      title: ticket.title,
      typeName: ticket.ticketType?.name ?? "Sin tipo",
      status: ticket.status,
      statusLabel:
        (TICKET_STATUS_CONFIG as Record<string, { label: string }>)[ticket.status]?.label ??
        ticket.status,
      priority: ticket.priority,
      createdAt:
        ticket.createdAt instanceof Date ? ticket.createdAt.toISOString() : String(ticket.createdAt),
      updatedAt:
        ticket.updatedAt instanceof Date ? ticket.updatedAt.toISOString() : String(ticket.updatedAt),
    };

    // Notify approval group (bell + email + push) and the guardia (push) via
    // the unified notify() service. The detailed confirmation email to the
    // guardia (with ticket name + status) keeps a custom template below
    // because notify()'s generic template doesn't carry that copy.
    try {
      const { notify } = await import("@/lib/notifications/notify");
      const { resend, getTenantEmailConfig } = await import("@/lib/resend");
      const { render } = await import("@react-email/render");
      const NotificationEmail = (await import("@/emails/NotificationEmail")).default;

      const targetUserIds: string[] = [];
      if (needsApproval && ticketType.approvalSteps.length > 0) {
        const firstStep = ticketType.approvalSteps[0];
        if (firstStep.approverGroupId) {
          const groupMembers = await prisma.adminGroupMembership.findMany({
            where: { groupId: firstStep.approverGroupId },
            select: { adminId: true },
          });
          for (const m of groupMembers) targetUserIds.push(m.adminId);
        }
        if (firstStep.approverUserId) {
          targetUserIds.push(firstStep.approverUserId);
        }
      }

      const uniqueTargets = [...new Set(targetUserIds)];
      if (uniqueTargets.length > 0) {
        await notify({
          tenantId: effectiveTenantId,
          type: "ticket_created",
          targetIds: uniqueTargets,
          targetType: "ADMIN",
          title: `Nuevo ticket portal: ${ticket.code} - ${title}`,
          body: `Tipo: ${ticketType.name} · Origen: Portal del guardia${needsApproval ? " · Pendiente de aprobación" : ""}`,
          link: `/opai/ops/tickets/${ticket.id}`,
          data: { ticketId: ticket.id, code: ticket.code, source: "portal" },
        });
      }

      // Custom confirmation email to the guard (template-specific copy)
      const guardPersona = await prisma.opsGuardia.findFirst({
        where: { id: guardAuth.guardiaId },
        select: {
          persona: { select: { firstName: true, lastName: true, email: true } },
        },
      });

      if (guardPersona?.persona?.email) {
        const emailConfig = await getTenantEmailConfig(effectiveTenantId);
        const guardName = `${guardPersona.persona.firstName} ${guardPersona.persona.lastName}`;
        const html = await render(
          NotificationEmail({
            title: `Tu solicitud ${ticket.code} fue recibida`,
            message: `Hola ${guardName}, tu solicitud "${title}" (${ticketType.name}) ha sido recibida y está ${needsApproval ? "pendiente de aprobación" : "en proceso"}.`,
            actionUrl: undefined,
            actionLabel: undefined,
            category: "Portal del Guardia",
          })
        );

        await resend.emails.send({
          from: emailConfig.from,
          replyTo: emailConfig.replyTo,
          to: guardPersona.persona.email,
          subject: `Solicitud ${ticket.code} recibida`,
          html,
        });
      }

      // Push confirmation to the guard who submitted the ticket
      await notify({
        tenantId: effectiveTenantId,
        type: "ticket_created",
        targetIds: [guardAuth.guardiaId],
        targetType: "GUARD",
        audience: "guardia",
        title: `Solicitud ${ticket.code} recibida`,
        body: `Tu solicitud "${title}" está ${needsApproval ? "pendiente de aprobación" : "en proceso"}.`,
        data: { ticketId: ticket.id, code: ticket.code },
        forceChannels: { email: false }, // dedicated email already sent above
      });
    } catch (err) {
      console.error("[Portal Guardia] Error sending notifications:", err);
    }

    return NextResponse.json({ success: true, data: result }, { status: 201 });
  } catch (error) {
    console.error("[Portal Guardia] Tickets POST error:", error);
    return NextResponse.json(
      { success: false, error: "Error al crear ticket" },
      { status: 500 },
    );
  }
}
