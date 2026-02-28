/**
 * API Route: /api/ops/exams/[id]
 * GET    - Get exam with questions
 * PATCH  - Update exam (title, status, schedule)
 * DELETE - Delete exam
 */

import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { requireAuth, unauthorized, resolveApiPerms } from "@/lib/api-auth";
import { canView, canDelete } from "@/lib/permissions";

type Params = { id: string };

export async function GET(
  _request: NextRequest,
  { params }: { params: Promise<Params> },
) {
  try {
    const ctx = await requireAuth();
    if (!ctx) return unauthorized();

    const perms = await resolveApiPerms(ctx);
    if (!canView(perms, "ops")) {
      return NextResponse.json({ success: false, error: "Sin permisos para ver exámenes" }, { status: 403 });
    }

    const { id } = await params;

    const exam = await prisma.opsExam.findFirst({
      where: { id, tenantId: ctx.tenantId },
      include: {
        questions: { orderBy: { order: "asc" } },
        _count: { select: { assignments: true } },
        installation: { select: { id: true, name: true } },
      },
    });

    if (!exam) {
      return NextResponse.json(
        { success: false, error: "Examen no encontrado" },
        { status: 404 },
      );
    }

    return NextResponse.json({ success: true, data: exam });
  } catch (error) {
    console.error("[OPS][EXAM] Error fetching exam:", error);
    return NextResponse.json(
      { success: false, error: "Error al obtener examen" },
      { status: 500 },
    );
  }
}

export async function PATCH(
  request: NextRequest,
  { params }: { params: Promise<Params> },
) {
  try {
    const ctx = await requireAuth();
    if (!ctx) return unauthorized();

    const perms = await resolveApiPerms(ctx);
    if (!canDelete(perms, "ops")) {
      return NextResponse.json({ success: false, error: "Solo administradores pueden editar exámenes" }, { status: 403 });
    }

    const { id } = await params;

    const existing = await prisma.opsExam.findFirst({
      where: { id, tenantId: ctx.tenantId },
    });
    if (!existing) {
      return NextResponse.json(
        { success: false, error: "Examen no encontrado" },
        { status: 404 },
      );
    }

    const body = await request.json();
    const data: Record<string, unknown> = {};
    if (body.title !== undefined) data.title = body.title;
    if (body.status !== undefined) data.status = body.status;
    if (body.scheduleType !== undefined) data.scheduleType = body.scheduleType;
    if (body.recurringMonths !== undefined) data.recurringMonths = body.recurringMonths;

    const exam = await prisma.opsExam.update({
      where: { id },
      data,
      include: { questions: { orderBy: { order: "asc" } } },
    });

    return NextResponse.json({ success: true, data: exam });
  } catch (error) {
    console.error("[OPS][EXAM] Error updating exam:", error);
    return NextResponse.json(
      { success: false, error: "Error al actualizar examen" },
      { status: 500 },
    );
  }
}

export async function DELETE(
  _request: NextRequest,
  { params }: { params: Promise<Params> },
) {
  try {
    const ctx = await requireAuth();
    if (!ctx) return unauthorized();

    const perms = await resolveApiPerms(ctx);
    if (!canDelete(perms, "ops")) {
      return NextResponse.json({ success: false, error: "Solo administradores pueden eliminar exámenes" }, { status: 403 });
    }

    const { id } = await params;

    const existing = await prisma.opsExam.findFirst({
      where: { id, tenantId: ctx.tenantId },
    });
    if (!existing) {
      return NextResponse.json(
        { success: false, error: "Examen no encontrado" },
        { status: 404 },
      );
    }

    await prisma.opsExam.delete({ where: { id } });

    return NextResponse.json({ success: true });
  } catch (error) {
    console.error("[OPS][EXAM] Error deleting exam:", error);
    return NextResponse.json(
      { success: false, error: "Error al eliminar examen" },
      { status: 500 },
    );
  }
}
