/**
 * API Route: /api/crm/tasks/[id]
 * GET    - Detalle de una tarea (mismo select del listado).
 * PATCH  - Actualiza una tarea { title?, status?, dueAt?, allDay?, assignedTo?,
 *          assigneeIds? }. Si llega `assigneeIds` reemplaza el conjunto completo
 *          y resincroniza `assignedTo` (= primer responsable). Al pasar a "done"
 *          registra completedBy/completedAt (idempotente: conserva el primero);
 *          al reabrir ("open") los limpia.
 * DELETE - Elimina una tarea (sus responsables caen por FK cascade).
 *
 * Multi-tenant: valida que la tarea pertenezca a ctx.tenantId antes de mutar.
 * Permiso: productividad.tareas view/edit O crm.deals edit.
 */

import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { requireTasksAccess, canDeleteTask, taskDeleteForbidden } from "@/lib/api-auth-tareas";
import { auditTaskAction } from "@/lib/audit-productividad";

const MAX_ASSIGNEES = 20;
const NOTES_MAX = 5000;

const TASK_DETAIL_SELECT = {
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
  createdBy: true,
  createdAt: true,
  assignees: { select: { userId: true } },
} as const;

function parseAssigneeIds(value: unknown): string[] {
  const raw = Array.isArray(value) ? value : [];
  const ids = raw.filter((x): x is string => typeof x === "string" && x.length > 0);
  return [...new Set(ids)].slice(0, MAX_ASSIGNEES);
}

export async function GET(
  _request: NextRequest,
  { params }: { params: Promise<{ id: string }> },
) {
  try {
    const access = await requireTasksAccess("view");
    if (!access.authorized) return access.response;
    const ctx = access.ctx;

    const { id } = await params;
    const task = await prisma.crmTask.findFirst({
      where: { id, tenantId: ctx.tenantId },
      select: TASK_DETAIL_SELECT,
    });
    if (!task) {
      return NextResponse.json({ success: false, error: "Tarea no encontrada" }, { status: 404 });
    }

    const assigneeIds = task.assignees.length
      ? task.assignees.map((a) => a.userId)
      : task.assignedTo
        ? [task.assignedTo]
        : [];

    return NextResponse.json({
      success: true,
      data: { ...task, assigneeIds },
    });
  } catch (error) {
    console.error("Error fetching task:", error);
    return NextResponse.json({ success: false, error: "Error al obtener tarea" }, { status: 500 });
  }
}

export async function PATCH(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> },
) {
  try {
    const access = await requireTasksAccess("edit");
    if (!access.authorized) return access.response;
    const ctx = access.ctx;

    const { id } = await params;
    const existing = await prisma.crmTask.findFirst({
      where: { id, tenantId: ctx.tenantId },
      select: { id: true, completedBy: true, createdBy: true, title: true, status: true },
    });
    if (!existing) {
      return NextResponse.json({ success: false, error: "Tarea no encontrada" }, { status: 404 });
    }

    const body = (await request.json().catch(() => ({}))) as Record<string, unknown>;
    const data: {
      title?: string;
      notes?: string | null;
      status?: string;
      dueAt?: Date | null;
      allDay?: boolean;
      assignedTo?: string | null;
      completedBy?: string | null;
      completedAt?: Date | null;
    } = {};

    if (body?.allDay !== undefined) data.allDay = body.allDay === true;

    // Legacy single `assignedTo` (retrocompat) — sólo si no llega assigneeIds.
    if (body?.assigneeIds === undefined && body?.assignedTo !== undefined) {
      if (body.assignedTo === null || body.assignedTo === "") {
        data.assignedTo = null;
      } else if (typeof body.assignedTo === "string") {
        const assignee = await prisma.admin.findFirst({
          where: { id: body.assignedTo, tenantId: ctx.tenantId, status: "active" },
          select: { id: true },
        });
        if (!assignee) return NextResponse.json({ success: false, error: "Responsable inválido" }, { status: 400 });
        data.assignedTo = assignee.id;
      } else {
        return NextResponse.json({ success: false, error: "Responsable inválido" }, { status: 400 });
      }
    }

    // Conjunto multi-responsable.
    let nextAssignees: string[] | null = null;
    if (body?.assigneeIds !== undefined) {
      let ids = parseAssigneeIds(body.assigneeIds);
      if (ids.length === 0) {
        // No dejar la tarea huérfana. Nota: CrmTask no tiene createdBy, así que
        // el fallback es el usuario que edita (no el creador original).
        ids = [ctx.userId];
      } else {
        const valid = await prisma.admin.findMany({
          where: { id: { in: ids }, tenantId: ctx.tenantId, status: "active" },
          select: { id: true },
        });
        if (valid.length !== ids.length) {
          return NextResponse.json({ success: false, error: "Responsable inválido" }, { status: 400 });
        }
      }
      nextAssignees = ids;
      data.assignedTo = ids[0]; // resincroniza denormalización
    }

    if (body?.title !== undefined) {
      const title = typeof body.title === "string" ? body.title.trim() : "";
      if (!title) return NextResponse.json({ success: false, error: "El título no puede quedar vacío" }, { status: 400 });
      data.title = title;
    }
    // notes: null o cadena vacía → limpia el campo. Máx 5000, validado en servidor.
    if (body?.notes !== undefined) {
      if (body.notes === null) {
        data.notes = null;
      } else if (typeof body.notes === "string") {
        const trimmed = body.notes.trim();
        if (trimmed.length > NOTES_MAX) {
          return NextResponse.json({ success: false, error: `Las notas superan el máximo de ${NOTES_MAX} caracteres` }, { status: 400 });
        }
        data.notes = trimmed.length ? trimmed : null;
      } else {
        return NextResponse.json({ success: false, error: "Notas inválidas" }, { status: 400 });
      }
    }
    if (body?.status !== undefined) {
      if (body.status !== "open" && body.status !== "done") {
        return NextResponse.json({ success: false, error: "Estado inválido (open|done)" }, { status: 400 });
      }
      data.status = body.status;
      if (body.status === "done") {
        // Idempotente: conserva el primer completedBy.
        if (!existing.completedBy) {
          data.completedBy = ctx.userId;
          data.completedAt = new Date();
        }
      } else {
        data.completedBy = null;
        data.completedAt = null;
      }
    }
    if (body?.dueAt !== undefined) {
      if (body.dueAt === null) {
        data.dueAt = null;
      } else if (typeof body.dueAt === "string" && !Number.isNaN(Date.parse(body.dueAt))) {
        data.dueAt = new Date(body.dueAt);
      } else {
        return NextResponse.json({ success: false, error: "Fecha de vencimiento inválida" }, { status: 400 });
      }
    }

    const task = await prisma.$transaction(async (tx) => {
      const updated = await tx.crmTask.update({
        where: { id },
        data,
        select: {
          id: true, title: true, notes: true, status: true, type: true, dueAt: true,
          allDay: true, assignedTo: true, completedBy: true, completedAt: true, createdAt: true,
        },
      });
      if (nextAssignees) {
        await tx.crmTaskAssignee.deleteMany({ where: { taskId: id } });
        await tx.crmTaskAssignee.createMany({
          data: nextAssignees.map((userId) => ({ taskId: id, userId })),
          skipDuplicates: true,
        });
      }
      const assignees = await tx.crmTaskAssignee.findMany({ where: { taskId: id }, select: { userId: true } });
      return { ...updated, assigneeIds: assignees.map((a) => a.userId) };
    });

    void auditTaskAction({
      tenantId: ctx.tenantId,
      userId: ctx.userId,
      userEmail: ctx.userEmail,
      action:
        body?.status === "done" && existing.status !== "done"
          ? "completed"
          : body?.status === "open" && existing.status === "done"
            ? "reopened"
            : "updated",
      taskId: id,
      meta: { title: task.title },
      request,
    });

    return NextResponse.json({ success: true, data: task });
  } catch (error) {
    console.error("Error updating task:", error);
    return NextResponse.json({ success: false, error: "Error al actualizar tarea" }, { status: 500 });
  }
}

export async function DELETE(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> },
) {
  try {
    const access = await requireTasksAccess("edit");
    if (!access.authorized) return access.response;
    const ctx = access.ctx;

    const { id } = await params;
    const existing = await prisma.crmTask.findFirst({
      where: { id, tenantId: ctx.tenantId },
      select: { id: true, createdBy: true, title: true },
    });
    if (!existing) {
      return NextResponse.json({ success: false, error: "Tarea no encontrada" }, { status: 404 });
    }
    if (!canDeleteTask(ctx, existing)) {
      return taskDeleteForbidden();
    }

    await prisma.crmTask.delete({ where: { id } });

    void auditTaskAction({
      tenantId: ctx.tenantId,
      userId: ctx.userId,
      userEmail: ctx.userEmail,
      action: "deleted",
      taskId: id,
      meta: { title: existing.title },
      request,
    });

    return NextResponse.json({ success: true });
  } catch (error) {
    console.error("Error deleting task:", error);
    return NextResponse.json({ success: false, error: "Error al eliminar tarea" }, { status: 500 });
  }
}
