/**
 * API Route: /api/crm/tasks/[id]
 * PATCH  - Actualiza una tarea del checklist
 *          { title?, status?, dueAt?, allDay?, assignedTo? }.
 * DELETE - Elimina una tarea del checklist.
 *
 * Multi-tenant: valida que la tarea pertenezca a ctx.tenantId antes de mutar.
 * Permiso CRM edit sobre deals (el checklist vive en la ficha del negocio).
 */

import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { requireAuth, unauthorized } from "@/lib/api-auth";
import { requireCrmEdit } from "@/lib/api-auth-crm";
import { requireTenantModule } from "@/lib/require-module";

export async function PATCH(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const modCheck = await requireTenantModule("crm");
    if (!modCheck.authorized) return modCheck.response;

    const ctx = await requireAuth();
    if (!ctx) return unauthorized();
    const forbidden = await requireCrmEdit(ctx, "deals");
    if (forbidden) return forbidden;

    const { id } = await params;
    const existing = await prisma.crmTask.findFirst({
      where: { id, tenantId: ctx.tenantId },
      select: { id: true },
    });
    if (!existing) {
      return NextResponse.json({ success: false, error: "Tarea no encontrada" }, { status: 404 });
    }

    const body = await request.json().catch(() => ({}));
    const data: {
      title?: string;
      status?: string;
      dueAt?: Date | null;
      allDay?: boolean;
      assignedTo?: string | null;
    } = {};

    if (body?.allDay !== undefined) data.allDay = body.allDay === true;
    if (body?.assignedTo !== undefined) {
      if (body.assignedTo === null || body.assignedTo === "") {
        data.assignedTo = null;
      } else if (typeof body.assignedTo === "string") {
        const assignee = await prisma.admin.findFirst({
          where: { id: body.assignedTo, tenantId: ctx.tenantId, status: "active" },
          select: { id: true },
        });
        if (!assignee) {
          return NextResponse.json(
            { success: false, error: "Responsable inválido" },
            { status: 400 },
          );
        }
        data.assignedTo = assignee.id;
      } else {
        return NextResponse.json(
          { success: false, error: "Responsable inválido" },
          { status: 400 },
        );
      }
    }

    if (body?.title !== undefined) {
      const title = typeof body.title === "string" ? body.title.trim() : "";
      if (!title) {
        return NextResponse.json({ success: false, error: "El título no puede quedar vacío" }, { status: 400 });
      }
      data.title = title;
    }
    if (body?.status !== undefined) {
      if (body.status !== "open" && body.status !== "done") {
        return NextResponse.json({ success: false, error: "Estado inválido (open|done)" }, { status: 400 });
      }
      data.status = body.status;
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

    const task = await prisma.crmTask.update({
      where: { id },
      data,
      select: {
        id: true,
        title: true,
        status: true,
        type: true,
        dueAt: true,
        allDay: true,
        assignedTo: true,
        createdAt: true,
      },
    });

    return NextResponse.json({ success: true, data: task });
  } catch (error) {
    console.error("Error updating task:", error);
    return NextResponse.json({ success: false, error: "Error al actualizar tarea" }, { status: 500 });
  }
}

export async function DELETE(
  _request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const modCheck = await requireTenantModule("crm");
    if (!modCheck.authorized) return modCheck.response;

    const ctx = await requireAuth();
    if (!ctx) return unauthorized();
    const forbidden = await requireCrmEdit(ctx, "deals");
    if (forbidden) return forbidden;

    const { id } = await params;
    const existing = await prisma.crmTask.findFirst({
      where: { id, tenantId: ctx.tenantId },
      select: { id: true },
    });
    if (!existing) {
      return NextResponse.json({ success: false, error: "Tarea no encontrada" }, { status: 404 });
    }

    await prisma.crmTask.delete({ where: { id } });

    return NextResponse.json({ success: true });
  } catch (error) {
    console.error("Error deleting task:", error);
    return NextResponse.json({ success: false, error: "Error al eliminar tarea" }, { status: 500 });
  }
}
