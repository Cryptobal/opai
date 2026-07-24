/**
 * API Route: /api/crm/tasks
 * GET  - Lista tareas del tenant con filtros (status, assigneeId, from, to, q)
 *        y paginación por cursor. Orden dueAt asc nulls last.
 * POST - Crea una tarea suelta (quick-create de la Agenda) o vinculada a
 *        cuenta/negocio. Multi-responsable: { assigneeIds?: string[] } (o el
 *        legacy { assignedTo?: string }). Vacío → el creador.
 *
 * Multi-tenant: tenantId de la sesión; responsables/cuenta/negocio se validan
 * contra el tenant. Permiso: productividad.tareas edit O crm.deals edit.
 */

import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { requireTasksAccess } from "@/lib/api-auth-tareas";

const MAX_ASSIGNEES = 20;
const NOTES_MAX = 5000;

/**
 * Normaliza el contexto libre `notes`. Devuelve `{ value }` con la cadena
 * saneada (o `null` si queda vacía / llega null), o `null` si es inválido
 * (tipo incorrecto o supera NOTES_MAX). El caller decide el 400.
 */
function parseNotes(raw: unknown): { value: string | null } | null {
  if (raw === null) return { value: null };
  if (typeof raw !== "string") return null;
  const trimmed = raw.trim();
  if (trimmed.length > NOTES_MAX) return null;
  return { value: trimmed.length ? trimmed : null };
}

/** Normaliza responsables desde `assigneeIds` (o el legacy `assignedTo`). */
function parseAssigneeIds(body: Record<string, unknown>): string[] {
  const raw = Array.isArray(body.assigneeIds)
    ? body.assigneeIds
    : typeof body.assignedTo === "string" && body.assignedTo
      ? [body.assignedTo]
      : [];
  const ids = raw.filter((x): x is string => typeof x === "string" && x.length > 0);
  return [...new Set(ids)].slice(0, MAX_ASSIGNEES);
}

export async function GET(request: NextRequest) {
  try {
    const access = await requireTasksAccess("view");
    if (!access.authorized) return access.response;
    const ctx = access.ctx;

    const url = new URL(request.url);
    const status = url.searchParams.get("status");
    const assigneeId = url.searchParams.get("assigneeId");
    const from = url.searchParams.get("from");
    const to = url.searchParams.get("to");
    const q = url.searchParams.get("q");
    const cursor = url.searchParams.get("cursor");
    const take = Math.min(Number(url.searchParams.get("limit")) || 100, 200);

    const where: Record<string, unknown> = { tenantId: ctx.tenantId };
    if (status === "open" || status === "done") where.status = status;
    if (assigneeId) where.assignees = { some: { userId: assigneeId } };
    if (q && q.trim()) where.title = { contains: q.trim(), mode: "insensitive" };
    if (from || to) {
      const due: Record<string, Date> = {};
      if (from && !Number.isNaN(Date.parse(from))) due.gte = new Date(from);
      if (to && !Number.isNaN(Date.parse(to))) due.lt = new Date(to);
      if (Object.keys(due).length) where.dueAt = due;
    }

    const rows = await prisma.crmTask.findMany({
      where,
      orderBy: [{ dueAt: { sort: "asc", nulls: "last" } }, { createdAt: "asc" }],
      take: take + 1,
      ...(cursor ? { cursor: { id: cursor }, skip: 1 } : {}),
      select: {
        id: true,
        title: true,
        notes: true,
        status: true,
        type: true,
        dueAt: true,
        allDay: true,
        assignedTo: true,
        completedBy: true,
        completedAt: true,
        dealId: true,
        accountId: true,
        emailThreadId: true,
        createdAt: true,
        assignees: { select: { userId: true } },
      },
    });

    const hasMore = rows.length > take;
    const items = (hasMore ? rows.slice(0, take) : rows).map((t) => ({
      ...t,
      assigneeIds: t.assignees.map((a) => a.userId),
    }));
    const nextCursor = hasMore ? items[items.length - 1]?.id ?? null : null;

    return NextResponse.json({ success: true, data: items, nextCursor });
  } catch (error) {
    console.error("Error listing tasks:", error);
    return NextResponse.json({ success: false, error: "Error al listar tareas" }, { status: 500 });
  }
}

export async function POST(request: NextRequest) {
  try {
    const access = await requireTasksAccess("edit");
    if (!access.authorized) return access.response;
    const ctx = access.ctx;

    const body = (await request.json().catch(() => ({}))) as Record<string, unknown>;

    const title = typeof body?.title === "string" ? body.title.trim() : "";
    if (!title) {
      return NextResponse.json({ success: false, error: "El título no puede quedar vacío" }, { status: 400 });
    }

    let notes: string | null = null;
    if (body?.notes !== undefined) {
      const parsed = parseNotes(body.notes);
      if (!parsed) {
        return NextResponse.json({ success: false, error: `Las notas superan el máximo de ${NOTES_MAX} caracteres` }, { status: 400 });
      }
      notes = parsed.value;
    }

    let dueAt: Date | null = null;
    if (body?.dueAt != null) {
      if (typeof body.dueAt !== "string" || Number.isNaN(Date.parse(body.dueAt))) {
        return NextResponse.json({ success: false, error: "Fecha de vencimiento inválida" }, { status: 400 });
      }
      dueAt = new Date(body.dueAt);
    }

    // Responsables: default el usuario actual; cada id debe ser del tenant.
    let assigneeIds = parseAssigneeIds(body);
    if (assigneeIds.length === 0) {
      assigneeIds = [ctx.userId];
    } else {
      const valid = await prisma.admin.findMany({
        where: { id: { in: assigneeIds }, tenantId: ctx.tenantId, status: "active" },
        select: { id: true },
      });
      if (valid.length !== assigneeIds.length) {
        return NextResponse.json({ success: false, error: "Responsable inválido" }, { status: 400 });
      }
    }
    const primary = assigneeIds[0];

    let dealId: string | null = null;
    if (typeof body?.dealId === "string" && body.dealId) {
      const deal = await prisma.crmDeal.findFirst({ where: { id: body.dealId, tenantId: ctx.tenantId }, select: { id: true } });
      if (!deal) return NextResponse.json({ success: false, error: "Negocio inválido" }, { status: 400 });
      dealId = deal.id;
    }

    let accountId: string | null = null;
    if (typeof body?.accountId === "string" && body.accountId) {
      const account = await prisma.crmAccount.findFirst({ where: { id: body.accountId, tenantId: ctx.tenantId }, select: { id: true } });
      if (!account) return NextResponse.json({ success: false, error: "Cuenta inválida" }, { status: 400 });
      accountId = account.id;
    }

    const task = await prisma.$transaction(async (tx) => {
      const created = await tx.crmTask.create({
        data: {
          tenantId: ctx.tenantId,
          title,
          notes,
          status: "open",
          type: "manual",
          dueAt,
          allDay: body?.allDay === true,
          assignedTo: primary, // denormalización de compatibilidad
          dealId,
          accountId,
        },
        select: {
          id: true, title: true, notes: true, status: true, type: true, dueAt: true,
          allDay: true, assignedTo: true, createdAt: true,
        },
      });
      await tx.crmTaskAssignee.createMany({
        data: assigneeIds.map((userId) => ({ taskId: created.id, userId })),
        skipDuplicates: true,
      });
      return created;
    });

    return NextResponse.json({ success: true, data: { ...task, assigneeIds } }, { status: 201 });
  } catch (error) {
    console.error("Error creating task:", error);
    return NextResponse.json({ success: false, error: "Error al crear tarea" }, { status: 500 });
  }
}
