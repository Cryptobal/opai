/**
 * GET  /api/crm/tasks/[id]/activity — timeline de seguimiento (máx 100).
 * POST /api/crm/tasks/[id]/activity — agrega comentario (kind=comment).
 */

import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { requireTasksAccess } from "@/lib/api-auth-tareas";

const COMMENT_MAX = 2000;

async function findTaskInTenant(id: string, tenantId: string) {
  return prisma.crmTask.findFirst({
    where: { id, tenantId },
    select: { id: true },
  });
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

    const task = await findTaskInTenant(id, ctx.tenantId);
    if (!task) {
      return NextResponse.json({ success: false, error: "Tarea no encontrada" }, { status: 404 });
    }

    const rows = await prisma.crmTaskActivity.findMany({
      where: { taskId: id, tenantId: ctx.tenantId },
      orderBy: { createdAt: "asc" },
      take: 100,
      select: {
        id: true,
        kind: true,
        payload: true,
        message: true,
        actorId: true,
        createdAt: true,
      },
    });

    return NextResponse.json({ success: true, data: rows });
  } catch (error) {
    console.error("Error listing task activity:", error);
    return NextResponse.json({ success: false, error: "Error al obtener actividad" }, { status: 500 });
  }
}

export async function POST(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> },
) {
  try {
    const access = await requireTasksAccess("edit");
    if (!access.authorized) return access.response;
    const ctx = access.ctx;
    const { id } = await params;

    const task = await findTaskInTenant(id, ctx.tenantId);
    if (!task) {
      return NextResponse.json({ success: false, error: "Tarea no encontrada" }, { status: 404 });
    }

    const body = (await request.json().catch(() => ({}))) as { message?: unknown };
    const message = typeof body.message === "string" ? body.message.trim() : "";
    if (!message || message.length > COMMENT_MAX) {
      return NextResponse.json(
        { success: false, error: `Comentario inválido (1–${COMMENT_MAX} caracteres)` },
        { status: 400 },
      );
    }

    const row = await prisma.crmTaskActivity.create({
      data: {
        taskId: id,
        tenantId: ctx.tenantId,
        kind: "comment",
        message,
        actorId: ctx.userId,
      },
      select: {
        id: true,
        kind: true,
        payload: true,
        message: true,
        actorId: true,
        createdAt: true,
      },
    });

    return NextResponse.json({ success: true, data: row }, { status: 201 });
  } catch (error) {
    console.error("Error creating task comment:", error);
    return NextResponse.json({ success: false, error: "Error al comentar" }, { status: 500 });
  }
}
