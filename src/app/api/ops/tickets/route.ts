import { NextRequest, NextResponse } from "next/server";
import type { Prisma } from "@prisma/client";
import { prisma } from "@/lib/prisma";
import { requireAuth, unauthorized } from "@/lib/api-auth";
import { ensureOpsAccess } from "@/lib/ops";
import { createOpsTicket } from "@/lib/tickets-create";
import { getAssignedTeamsForUser } from "@/lib/tickets-team-membership";
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

function mapTicket(
  t: any,
  assigneeMap?: Map<string, string>,
  reporterMap?: Map<string, string>,
): Ticket {
  const guardiaName =
    t.guardia?.persona
      ? formatPersonName(t.guardia.persona.firstName, t.guardia.persona.lastName)
      : null;

  const assignedToName = t.assignedTo && assigneeMap
    ? (assigneeMap.get(t.assignedTo) ?? null)
    : (t.assignedToName ?? null);

  const reportedByName = t.reportedBy && reporterMap
    ? (reporterMap.get(t.reportedBy) ?? null)
    : null;

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
    reportedByName,
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
    // Orden: criticality (default) prioriza P1, SLA vencidos y SLA próximo
    // a vencer; recent ordena por createdAt desc; sla ordena por slaDueAt asc
    // mostrando los próximos a vencer primero.
    const sortByParam = searchParams.get("sortBy");
    const sortBy: "criticality" | "recent" | "sla" =
      sortByParam === "recent" || sortByParam === "sla" || sortByParam === "criticality"
        ? sortByParam
        : "criticality";
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

    // Filtros por entidad CRM (account/deal/contact). Combinables con el resto.
    // Si la entidad existe pero no resuelve a tickets, marcamos `noMatch` y
    // devolvemos resultados vacíos sin tocar Prisma. Antes asignábamos
    // `where.id = "no-match"`, pero `OpsTicket.id` es UUID y Prisma falla con
    // P2023 ("Error creating UUID").
    const accountId = searchParams.get("accountId");
    const dealId = searchParams.get("dealId");
    const contactId = searchParams.get("contactId");
    let noMatch = false;

    if (accountId) {
      const installations = await prisma.crmInstallation.findMany({
        where: { tenantId: ctx.tenantId, accountId },
        select: { id: true },
      });
      if (installations.length === 0) {
        noMatch = true;
      } else {
        where.installationId = { in: installations.map((i) => i.id) };
      }
    }

    if (dealId) {
      const onboarding = await prisma.clientOnboarding.findUnique({
        where: { dealId },
        select: { id: true, installationId: true, tenantId: true },
      });
      const onboardingTicketIds: string[] = onboarding && onboarding.tenantId === ctx.tenantId
        ? (
            await prisma.clientOnboardingStep.findMany({
              where: { onboardingId: onboarding.id, ticketId: { not: null } },
              select: { ticketId: true },
            })
          )
            .map((s) => s.ticketId)
            .filter((x): x is string => !!x)
        : [];
      const orClauses: Prisma.OpsTicketWhereInput[] = [];
      if (onboardingTicketIds.length > 0) {
        orClauses.push({ id: { in: onboardingTicketIds } });
      }
      if (onboarding?.installationId) {
        orClauses.push({ installationId: onboarding.installationId });
      }
      if (orClauses.length === 0) {
        noMatch = true;
      } else {
        where.OR = orClauses;
      }
    }

    if (contactId) {
      const contact = await prisma.crmContact.findFirst({
        where: { id: contactId, tenantId: ctx.tenantId },
        select: { accountId: true },
      });
      if (!contact?.accountId) {
        noMatch = true;
      } else {
        const installations = await prisma.crmInstallation.findMany({
          where: { tenantId: ctx.tenantId, accountId: contact.accountId },
          select: { id: true },
        });
        if (installations.length === 0) {
          noMatch = true;
        } else {
          where.installationId = { in: installations.map((i) => i.id) };
        }
      }
    }

    // Short-circuit cuando algún filtro CRM no resolvió.
    if (noMatch) {
      return NextResponse.json({
        success: true,
        data: { items: [], total: 0, page, limit, hasMore: false },
      });
    }
    const andClauses: Prisma.OpsTicketWhereInput[] = [];
    if (assignedToParam === "me") {
      where.assignedTo = ctx.userId;
    } else if (assignedToParam === "unassigned") {
      where.assignedTo = null;
    } else if (assignedToParam === "my_team") {
      // Asignados a mí O asignados a un equipo donde soy miembro.
      const teams = await getAssignedTeamsForUser(ctx.tenantId, ctx.userId);
      if (teams.length === 0) {
        // Sin grupos → degrada a "asignados a mí" para que el filtro sea útil.
        where.assignedTo = ctx.userId;
      } else {
        andClauses.push({
          OR: [
            { assignedTo: ctx.userId },
            { assignedTeam: { in: teams } },
          ],
        });
      }
    } else if (assignedToParam) {
      where.assignedTo = assignedToParam;
    }

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

    // Mapeo de sortBy → Prisma orderBy. "criticality" usa una composición:
    // priority asc (p1<p2<p3<p4 alfabéticamente) → slaBreached desc (vencidos
    // primero) → slaDueAt asc (más próximos a vencer primero).
    const orderBy: Prisma.OpsTicketOrderByWithRelationInput[] =
      sortBy === "recent"
        ? [{ createdAt: "desc" }]
        : sortBy === "sla"
          ? [{ slaDueAt: { sort: "asc", nulls: "last" } }, { priority: "asc" }]
          : [
              { priority: "asc" },
              { slaBreached: "desc" },
              { slaDueAt: { sort: "asc", nulls: "last" } },
              { createdAt: "desc" },
            ];

    const [rows, total] = await Promise.all([
      prisma.opsTicket.findMany({
        where,
        include: ticketListIncludes,
        orderBy,
        skip,
        take: limit,
      }),
      prisma.opsTicket.count({ where }),
    ]);

    // Resolve assignee names. Filtramos por tenantId aunque los ids ya
    // vienen de tickets tenant-scoped: defensa en profundidad para evitar
    // cualquier filtración cross-tenant si en el futuro un assigneeId
    // queda inconsistente.
    const assigneeIds = [...new Set(rows.map((r) => r.assignedTo).filter(Boolean))] as string[];
    let assigneeMap = new Map<string, string>();
    if (assigneeIds.length > 0) {
      const admins = await prisma.admin.findMany({
        where: { id: { in: assigneeIds }, tenantId: ctx.tenantId },
        select: { id: true, name: true, email: true },
      });
      assigneeMap = new Map(admins.map((a) => [a.id, a.name || a.email]));
    }

    // Resolve reporter names. reportedBy puede ser Admin, OpsGuardia o
    // CrmContact según el origen (manual, portal_guardia, portal_cliente).
    const reporterIds = [...new Set(rows.map((r) => r.reportedBy).filter(Boolean))] as string[];
    let reporterMap = new Map<string, string>();
    if (reporterIds.length > 0) {
      const { resolveActorNames } = await import("@/lib/notifications/resolve-actor-name");
      const actors = await resolveActorNames(ctx.tenantId, reporterIds);
      reporterMap = new Map(Array.from(actors.entries()).map(([id, a]) => [id, a.name]));
    }

    const items: Ticket[] = rows.map((r) => mapTicket(r, assigneeMap, reporterMap));

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

    // ── Soporte "Solicitud de cliente" ─────────────────────────
    // Cuando el operador crea un ticket en nombre de un contacto del
    // CRM, validamos que el contacto y la instalación pertenezcan al
    // mismo tenant + cuenta. Esto permite forzar `source=portal_cliente`
    // para que el cliente vea el ticket en su portal y dispare el email
    // de confirmación con link de seguimiento.
    const rawContactId = typeof body.reportedByContactId === "string"
      ? body.reportedByContactId.trim()
      : "";
    let clientContact: {
      id: string;
      email: string | null;
      firstName: string;
      lastName: string;
      accountId: string;
    } | null = null;

    if (rawContactId) {
      const contact = await prisma.crmContact.findFirst({
        where: { id: rawContactId, tenantId: ctx.tenantId },
        select: {
          id: true,
          email: true,
          firstName: true,
          lastName: true,
          accountId: true,
        },
      });
      if (!contact) {
        return NextResponse.json(
          { success: false, error: "Contacto del cliente no encontrado" },
          { status: 404 },
        );
      }
      clientContact = contact;

      if (!body.installationId) {
        return NextResponse.json(
          {
            success: false,
            error: "Falta installationId al crear un ticket de cliente",
          },
          { status: 400 },
        );
      }

      const inst = await prisma.crmInstallation.findFirst({
        where: {
          id: body.installationId,
          tenantId: ctx.tenantId,
          accountId: contact.accountId,
        },
        select: { id: true },
      });
      if (!inst) {
        return NextResponse.json(
          {
            success: false,
            error: "La instalación no pertenece al cliente seleccionado",
          },
          { status: 400 },
        );
      }
    }

    // En tickets de cliente forzamos `source=portal_cliente` y dejamos
    // `reportedBy` con el id del CrmContact (el resolver de actores ya sabe
    // distinguir admin/guardia/contact). Quien lo creó realmente (el operador)
    // queda en el evento de audit `ticket_created.actorId`.
    const effectiveSource = clientContact ? "portal_cliente" : body.source ?? "manual";
    const effectiveReportedBy = clientContact ? clientContact.id : ctx.userId;

    // Creación única compartida con Slack (code + ticket + aprobaciones + audit
    // + notificaciones). Ver src/lib/tickets-create.ts.
    const result = await createOpsTicket({
      tenantId: ctx.tenantId,
      actorId: ctx.userId,
      reportedBy: effectiveReportedBy,
      title: body.title,
      description: body.description ?? null,
      ticketTypeId: typeId,
      priority: body.priority ?? null,
      source: effectiveSource,
      assignedTeam: body.assignedTeam ?? null,
      assignedTo: body.assignedTo ?? null,
      installationId: body.installationId ?? null,
      guardiaId: body.guardiaId ?? null,
      sourceGuardEventId: body.sourceGuardEventId ?? null,
      tags: body.tags ?? [],
    });
    if ("error" in result) {
      return NextResponse.json({ success: false, error: result.error }, { status: 400 });
    }

    // Recarga con los includes de lista para el mapper de la respuesta.
    const ticket = await prisma.opsTicket.findUnique({
      where: { id: result.id },
      include: ticketListIncludes,
    });
    if (!ticket) {
      return NextResponse.json({ success: false, error: "No se pudo crear el ticket" }, { status: 500 });
    }

    // ── Email + acceso público para tickets de cliente ────────
    // Si el operador eligió un contacto del CRM, generamos un PIN de
    // 6 dígitos para el portal público (/t/[code]) y enviamos al
    // contacto el correo de confirmación con link a su portal y al
    // acceso público con el PIN. Best-effort: si falla, no abortamos
    // la creación, solo dejamos log.
    let publicAccessReturn: { url: string; pin: string } | null = null;
    if (clientContact) {
      try {
        const bcrypt = await import("bcryptjs");
        const { randomInt } = await import("crypto");
        const pin = String(randomInt(0, 1_000_000)).padStart(6, "0");
        const hash = await bcrypt.default.hash(pin, 10);
        await prisma.opsTicket.update({
          where: { id: ticket.id },
          data: {
            publicPinHash: hash,
            publicPinSetAt: new Date(),
            publicAttempts: 0,
            publicLockedUntil: null,
          },
        });
        publicAccessReturn = { url: `/t/${ticket.code}`, pin };

        if (clientContact.email) {
          const fullName = [clientContact.firstName, clientContact.lastName]
            .filter(Boolean)
            .join(" ");
          const { sendClientTicketConfirmationEmail } = await import(
            "@/lib/tickets-confirmation-email"
          );
          await sendClientTicketConfirmationEmail({
            tenantId: ctx.tenantId,
            contactEmail: clientContact.email,
            contactName: fullName || null,
            ticketCode: ticket.code,
            ticketId: ticket.id,
            ticketTitle: ticket.title,
            ticketDescription: ticket.description ?? null,
            publicAccess: publicAccessReturn,
          });
        }
      } catch (err) {
        console.error("[OPS] Error preparando ticket de cliente:", err);
      }
    }

    return NextResponse.json(
      {
        success: true,
        data: mapTicket(ticket),
        // Devolvemos el PIN UNA SOLA VEZ para que la UI lo muestre al
        // operador (por si el cliente no recibió el email).
        publicAccess: publicAccessReturn,
      },
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
