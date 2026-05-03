import { NextRequest, NextResponse } from "next/server";
import type { Prisma } from "@prisma/client";
import { prisma } from "@/lib/prisma";
import { requireAuth, unauthorized } from "@/lib/api-auth";
import { ensureOpsAccess } from "@/lib/ops";
import { generateTicketCode, TICKET_TEAM_CONFIG } from "@/lib/tickets";
import type { Ticket } from "@/lib/tickets";
import {
  ticketSupervisionFindingInclude,
  pickTicketFinding,
} from "@/lib/tickets-finding";
import { formatPersonName } from "@/lib/personas";

const ACTIVE_STATUSES = [
  "open",
  "in_progress",
  "waiting",
  "pending_approval",
] as const;

const VALID_STATUSES = [
  ...ACTIVE_STATUSES,
  "resolved",
  "closed",
  "rejected",
  "cancelled",
] as const;

const VALID_PRIORITIES = ["p1", "p2", "p3", "p4"] as const;

function parseCsv<T extends string>(raw: string | null, allow: readonly T[]): T[] {
  if (!raw) return [];
  return raw
    .split(",")
    .map((s) => s.trim())
    .filter((s): s is T => (allow as readonly string[]).includes(s));
}

function originWhere(type: "internal" | "guard" | "client" | null): Prisma.OpsTicketWhereInput {
  if (type === "internal") {
    return {
      OR: [
        { ticketType: { origin: { in: ["internal", "both"] } } },
        { ticketTypeId: null },
      ],
    };
  }
  if (type === "guard") {
    return {
      OR: [
        { ticketType: { origin: { in: ["guard", "both"] } } },
        { ticketTypeId: null },
      ],
    };
  }
  if (type === "client") {
    return {
      OR: [
        { ticketType: { origin: "client" } },
        { source: "portal_cliente" },
      ],
    };
  }
  return {};
}

/* ── Prisma includes for list view ──────────────────────────── */

const ticketListIncludes = {
  ticketType: { select: { id: true, name: true, slug: true, origin: true } },
  guardia: {
    select: {
      id: true,
      code: true,
      persona: { select: { firstName: true, lastName: true, rut: true } },
    },
  },
  ...ticketSupervisionFindingInclude,
  _count: { select: { comments: true, approvals: true } },
};

/* ── Mapper ──────────────────────────────────────────────────── */

function mapTicket(t: any, assigneeMap?: Map<string, string>): Ticket {
  const guardiaName =
    t.guardia?.persona
      ? formatPersonName(t.guardia.persona.firstName, t.guardia.persona.lastName)
      : null;

  const assignedToName = t.assignedTo && assigneeMap
    ? (assigneeMap.get(t.assignedTo) ?? null)
    : (t.assignedToName ?? null);

  return {
    id: t.id,
    tenantId: t.tenantId,
    code: t.code,
    ticketTypeId: t.ticketTypeId,
    ticketType: t.ticketType ?? null,
    categoryId: t.ticketTypeId ?? "",
    status: t.status,
    priority: t.priority,
    title: t.title,
    description: t.description,
    assignedTeam: t.assignedTeam,
    assignedTo: t.assignedTo,
    assignedToName,
    installationId: t.installationId,
    source: t.source,
    sourceLogId: null,
    sourceGuardEventId: t.sourceGuardEventId,
    guardiaId: t.guardiaId,
    guardiaName,
    guardiaRut: t.guardia?.persona?.rut ?? null,
    guardiaCode: t.guardia?.code ?? null,
    reportedBy: t.reportedBy,
    slaDueAt: t.slaDueAt instanceof Date ? t.slaDueAt.toISOString() : t.slaDueAt,
    slaBreached: t.slaBreached,
    slaPausedAt: t.slaPausedAt instanceof Date ? t.slaPausedAt.toISOString() : t.slaPausedAt ?? null,
    slaPausedReason: t.slaPausedReason ?? null,
    slaPausedTotalMs: Number(t.slaPausedTotalMs ?? 0),
    slaExtensions: (t.slaExtensions as any) ?? null,
    snoozedUntil: t.snoozedUntil instanceof Date ? t.snoozedUntil.toISOString() : t.snoozedUntil ?? null,
    lastSlaNotifiedAt: t.lastSlaNotifiedAt instanceof Date ? t.lastSlaNotifiedAt.toISOString() : t.lastSlaNotifiedAt ?? null,
    resolvedAt: t.resolvedAt instanceof Date ? t.resolvedAt.toISOString() : t.resolvedAt,
    closedAt: t.closedAt instanceof Date ? t.closedAt.toISOString() : t.closedAt,
    resolutionNotes: t.resolutionNotes,
    tags: t.tags ?? [],
    currentApprovalStep: t.currentApprovalStep,
    approvalStatus: t.approvalStatus,
    createdAt: t.createdAt instanceof Date ? t.createdAt.toISOString() : t.createdAt,
    updatedAt: t.updatedAt instanceof Date ? t.updatedAt.toISOString() : t.updatedAt,
    commentsCount: t._count?.comments ?? 0,
    // En la lista no se incluyen comments por costo: sumar attachments
    // requeriría un sub-aggregate Json. Dejamos 0 acá; el detalle sí lo
    // calcula. Si alguna vista necesita el conteo, agregar índice GIN
    // sobre comments.attachments y un raw query.
    attachmentsCount: 0,
    finding: pickTicketFinding(t),
  };
}

/* ── GET /api/ops/tickets ────────────────────────────────────── */

export async function GET(request: NextRequest) {
  try {
    const ctx = await requireAuth();
    if (!ctx) return unauthorized();
    const forbidden = await ensureOpsAccess(ctx);
    if (forbidden) return forbidden;

    const { searchParams } = new URL(request.url);
    const status = searchParams.get("status");
    const statuses = parseCsv(searchParams.get("statuses"), VALID_STATUSES);
    const activeOnly = searchParams.get("activeOnly") === "true";
    const priority = searchParams.get("priority");
    const priorities = parseCsv(searchParams.get("priorities"), VALID_PRIORITIES);
    const assignedTeam = searchParams.get("assignedTeam");
    const ticketTypeId = searchParams.get("ticketTypeId");
    const guardiaId = searchParams.get("guardiaId");
    const installationId = searchParams.get("installationId");
    const originParam = searchParams.get("origin");
    const origin =
      originParam === "internal" || originParam === "guard" || originParam === "client"
        ? originParam
        : null;
    // assignedTo: "me" → ctx.userId, "unassigned" → null, "<uuid>" → that admin id
    const assignedToParam = searchParams.get("assignedTo");
    const search = searchParams.get("search");
    const slaBreachedOnly = searchParams.get("slaBreached") === "true";
    const page = Math.max(1, parseInt(searchParams.get("page") ?? "1", 10));
    const limit = Math.min(200, Math.max(1, parseInt(searchParams.get("limit") ?? "50", 10)));
    const skip = (page - 1) * limit;

    // Build where clause
    const where: Prisma.OpsTicketWhereInput = { tenantId: ctx.tenantId };

    // Status: prefer activeOnly > statuses (csv) > status (legacy single)
    if (activeOnly) {
      where.status = { in: [...ACTIVE_STATUSES] };
    } else if (statuses.length > 0) {
      where.status = { in: statuses };
    } else if (status) {
      where.status = status;
    }

    if (priorities.length > 0) {
      where.priority = { in: priorities };
    } else if (priority) {
      where.priority = priority;
    }

    if (assignedTeam) where.assignedTeam = assignedTeam;
    if (ticketTypeId) where.ticketTypeId = ticketTypeId;
    if (guardiaId) where.guardiaId = guardiaId;
    if (installationId) where.installationId = installationId;
    if (slaBreachedOnly) where.slaBreached = true;
    if (assignedToParam === "me") {
      where.assignedTo = ctx.userId;
    } else if (assignedToParam === "unassigned") {
      where.assignedTo = null;
    } else if (assignedToParam) {
      where.assignedTo = assignedToParam;
    }

    const andClauses: Prisma.OpsTicketWhereInput[] = [];
    if (origin) andClauses.push(originWhere(origin));
    if (search) {
      andClauses.push({
        OR: [
          { title: { contains: search, mode: "insensitive" } },
          { code: { contains: search, mode: "insensitive" } },
          { description: { contains: search, mode: "insensitive" } },
        ],
      });
    }
    if (andClauses.length > 0) {
      where.AND = andClauses;
    }

    const [rows, total] = await Promise.all([
      prisma.opsTicket.findMany({
        where,
        include: ticketListIncludes,
        orderBy: { createdAt: "desc" },
        skip,
        take: limit,
      }),
      prisma.opsTicket.count({ where }),
    ]);

    // Resolve assignee names
    const assigneeIds = [...new Set(rows.map((r) => r.assignedTo).filter(Boolean))] as string[];
    let assigneeMap = new Map<string, string>();
    if (assigneeIds.length > 0) {
      const admins = await prisma.admin.findMany({
        where: { id: { in: assigneeIds } },
        select: { id: true, name: true, email: true },
      });
      assigneeMap = new Map(admins.map((a) => [a.id, a.name || a.email]));
    }

    const items: Ticket[] = rows.map((r) => mapTicket(r, assigneeMap));

    return NextResponse.json({
      success: true,
      data: {
        items,
        total,
        page,
        limit,
        hasMore: skip + items.length < total,
      },
    });
  } catch (error) {
    console.error("[OPS] Error listing tickets:", error);
    return NextResponse.json(
      { success: false, error: "No se pudo obtener los tickets" },
      { status: 500 },
    );
  }
}

/* ── POST /api/ops/tickets ───────────────────────────────────── */

export async function POST(request: NextRequest) {
  try {
    const ctx = await requireAuth();
    if (!ctx) return unauthorized();
    const forbidden = await ensureOpsAccess(ctx);
    if (forbidden) return forbidden;

    const body = await request.json();

    let typeId: string | undefined = body.ticketTypeId ?? body.categoryId;

    if (!body.title) {
      return NextResponse.json(
        { success: false, error: "El asunto (title) es requerido" },
        { status: 400 },
      );
    }

    if (!typeId) {
      const defaultType = await prisma.opsTicketType.findFirst({
        where: { tenantId: ctx.tenantId, isActive: true },
        orderBy: { sortOrder: "asc" },
        select: { id: true },
      });
      typeId = defaultType?.id;
    }

    if (!typeId) {
      return NextResponse.json(
        { success: false, error: "No hay tipos de ticket configurados. Configure uno en Ops > Tipos de ticket." },
        { status: 400 },
      );
    }

    const ticketType = await prisma.opsTicketType.findFirst({
      where: { id: typeId, tenantId: ctx.tenantId },
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
    const requiresApproval =
      ticketType.requiresApproval && ticketType.approvalSteps.length > 0;
    const initialStatus = requiresApproval ? "pending_approval" : "open";

    const approvalCreateData = requiresApproval
      ? ticketType.approvalSteps.map((step) => ({
          stepOrder: step.stepOrder,
          stepLabel: step.label,
          approverType: step.approverType,
          approverGroupId: step.approverGroupId,
          approverUserId: step.approverUserId,
          decision: "pending",
        }))
      : [];

    // Atomic: generate code + create ticket inside a transaction
    const ticket = await prisma.$transaction(async (tx) => {
      const lastTicket = await tx.opsTicket.findFirst({
        where: { tenantId: ctx.tenantId },
        orderBy: { createdAt: "desc" },
        select: { code: true },
      });
      const lastSeq = lastTicket?.code
        ? parseInt(lastTicket.code.split("-").pop() ?? "0", 10)
        : 0;
      const code = generateTicketCode(lastSeq + 1);

      return tx.opsTicket.create({
        data: {
          tenantId: ctx.tenantId,
          code,
          ticketTypeId: typeId,
          status: initialStatus,
          priority: body.priority ?? ticketType.defaultPriority,
          title: body.title,
          description: body.description ?? null,
          assignedTeam: body.assignedTeam ?? ticketType.assignedTeam,
          assignedTo: body.assignedTo ?? null,
          installationId: body.installationId ?? null,
          source: body.source ?? "manual",
          sourceGuardEventId: body.sourceGuardEventId ?? null,
          guardiaId: body.guardiaId ?? null,
          reportedBy: ctx.userId,
          slaDueAt,
          slaBreached: false,
          tags: body.tags ?? [],
          currentApprovalStep: requiresApproval ? 1 : null,
          approvalStatus: requiresApproval ? "pending" : null,
          approvals: {
            create: approvalCreateData,
          },
        },
        include: ticketListIncludes,
      });
    });

    // Notify reporter + first approval group (bell + email + push, targeted)
    const approvalTargetIds: string[] = [];
    try {
      const targetUserIds: string[] = [];

      const reporter = await prisma.admin.findFirst({
        where: { id: ctx.userId, tenantId: ctx.tenantId },
        select: { name: true, email: true },
      });
      const reporterName = reporter?.name || reporter?.email || "Usuario";

      // El creador NO se auto-notifica de su propio ticket. La notificación al
      // asignado (si existe) se dispara más abajo vía notifyTicketAssigned.
      // Aquí solo notificamos al grupo de aprobadores cuando el ticket requiere
      // aprobación (caso en que SÍ deben enterarse).
      if (requiresApproval && ticketType.approvalSteps.length > 0) {
        const firstStep = ticketType.approvalSteps[0];
        if (firstStep.approverGroupId) {
          const groupMembers = await prisma.adminGroupMembership.findMany({
            where: { groupId: firstStep.approverGroupId },
            select: { adminId: true },
          });
          for (const m of groupMembers) {
            targetUserIds.push(m.adminId);
            approvalTargetIds.push(m.adminId);
          }
        }
        if (firstStep.approverUserId) {
          targetUserIds.push(firstStep.approverUserId);
          approvalTargetIds.push(firstStep.approverUserId);
        }
      }

      const teamLabel = TICKET_TEAM_CONFIG[ticket.assignedTeam as keyof typeof TICKET_TEAM_CONFIG]?.label ?? ticket.assignedTeam;
      const bellMessage = `Tipo: ${ticketType.name} · Prioridad: ${ticket.priority.toUpperCase()}${requiresApproval ? " · Pendiente de aprobación" : ""}`;
      const emailLines = [
        `Tipo: ${ticketType.name} · Origen: ${ticket.source === "guard_portal" ? "Portal del guardia" : ticket.source === "manual" ? "Manual" : ticket.source}${requiresApproval ? " · Pendiente de aprobación" : ""}`,
        `Creado por: ${reporterName}`,
        `Equipo: ${teamLabel}`,
        `Prioridad: ${ticket.priority.toUpperCase()}`,
      ];
      if (ticket.description) {
        const desc = ticket.description.length > 200 ? ticket.description.slice(0, 200) + "…" : ticket.description;
        emailLines.push(`\nDescripción:\n${desc}`);
      }

      const uniqueTargets = [...new Set(targetUserIds)];
      if (uniqueTargets.length > 0) {
        const { notify } = await import("@/lib/notifications/notify");
        await notify({
          tenantId: ctx.tenantId,
          type: "ticket_created",
          targetIds: uniqueTargets,
          targetType: "ADMIN",
          title: `Nuevo ticket: ${ticket.code} - ${ticket.title}`,
          body: bellMessage,
          emailBody: emailLines.join("\n"),
          link: `/opai/ops/tickets/${ticket.id}`,
          data: { ticketId: ticket.id, code: ticket.code, priority: ticket.priority },
        });
      }

      if (requiresApproval && approvalTargetIds.length > 0) {
        const { notify } = await import("@/lib/notifications/notify");
        await notify({
          tenantId: ctx.tenantId,
          type: "ticket_needs_approval",
          targetIds: approvalTargetIds,
          targetType: "ADMIN",
          title: `Ticket ${ticket.code} pendiente de aprobación`,
          body: `"${ticket.title}" requiere tu aprobación`,
          link: `/opai/ops/tickets/${ticket.id}`,
          data: { ticketId: ticket.id, code: ticket.code },
        });
      }

      // Notificar al nuevo responsable si fue asignado al crear el ticket.
      if (ticket.assignedTo && ticket.assignedTo !== ctx.userId) {
        const { notifyTicketAssigned } = await import(
          "@/lib/notifications/notify-ticket-assigned"
        );
        await notifyTicketAssigned({
          tenantId: ctx.tenantId,
          ticketId: ticket.id,
          ticketCode: ticket.code,
          ticketTitle: ticket.title,
          ticketPriority: ticket.priority,
          ticketAssignedTeam: ticket.assignedTeam,
          assigneeId: ticket.assignedTo,
          assignedById: ctx.userId,
          source: "creation",
        });
      }
    } catch (err) {
      console.error("[OPS] Error notifying ticket creation:", err);
    }

    return NextResponse.json(
      { success: true, data: mapTicket(ticket) },
      { status: 201 },
    );
  } catch (error) {
    console.error("[OPS] Error creating ticket:", error);
    return NextResponse.json(
      { success: false, error: "No se pudo crear el ticket" },
      { status: 500 },
    );
  }
}
