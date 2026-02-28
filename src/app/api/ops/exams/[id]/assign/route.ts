/**
 * API Route: /api/ops/exams/[id]/assign
 * GET  - List assignments for an exam
 * POST - Assign exam to guards
 *
 * Body: { guardIds: string[] }
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
      return NextResponse.json({ success: false, error: "Sin permisos para ver asignaciones" }, { status: 403 });
    }

    const { id } = await params;

    // Verify exam belongs to tenant
    const exam = await prisma.opsExam.findFirst({
      where: { id, tenantId: ctx.tenantId },
      select: { id: true },
    });
    if (!exam) {
      return NextResponse.json(
        { success: false, error: "Examen no encontrado" },
        { status: 404 },
      );
    }

    const assignments = await prisma.opsExamAssignment.findMany({
      where: { examId: id, tenantId: ctx.tenantId },
      include: {
        guard: {
          include: {
            persona: { select: { firstName: true, lastName: true } },
          },
        },
      },
      orderBy: { sentAt: "desc" },
    });

    return NextResponse.json({ success: true, data: assignments });
  } catch (error) {
    console.error("[OPS][EXAM] Error fetching assignments:", error);
    return NextResponse.json(
      { success: false, error: "Error al obtener asignaciones" },
      { status: 500 },
    );
  }
}

export async function POST(
  request: NextRequest,
  { params }: { params: Promise<Params> },
) {
  try {
    const ctx = await requireAuth();
    if (!ctx) return unauthorized();

    const perms = await resolveApiPerms(ctx);
    if (!canDelete(perms, "ops")) {
      return NextResponse.json({ success: false, error: "Solo administradores pueden asignar exámenes" }, { status: 403 });
    }

    const { id } = await params;
    const body = await request.json();
    const { guardIds } = body as { guardIds: string[] };

    if (!Array.isArray(guardIds) || guardIds.length === 0) {
      return NextResponse.json(
        { success: false, error: "guardIds array requerido (al menos 1)" },
        { status: 400 },
      );
    }

    // Verify exam belongs to tenant and is active
    const exam = await prisma.opsExam.findFirst({
      where: { id, tenantId: ctx.tenantId },
      select: { id: true, status: true },
    });
    if (!exam) {
      return NextResponse.json(
        { success: false, error: "Examen no encontrado" },
        { status: 404 },
      );
    }

    if (exam.status !== "active") {
      return NextResponse.json(
        { success: false, error: "El examen debe estar activo para asignarlo" },
        { status: 400 },
      );
    }

    // Check for existing assignments to determine attempt number
    const existingAssignments = await prisma.opsExamAssignment.findMany({
      where: { examId: id, guardId: { in: guardIds } },
      select: { guardId: true, attemptNumber: true },
    });

    const maxAttemptByGuard = new Map<string, number>();
    for (const a of existingAssignments) {
      const current = maxAttemptByGuard.get(a.guardId) ?? 0;
      if (a.attemptNumber > current) {
        maxAttemptByGuard.set(a.guardId, a.attemptNumber);
      }
    }

    // Create assignments
    const assignments = await prisma.$transaction(
      guardIds.map((guardId) =>
        prisma.opsExamAssignment.create({
          data: {
            tenantId: ctx.tenantId,
            examId: id,
            guardId,
            status: "sent",
            attemptNumber: (maxAttemptByGuard.get(guardId) ?? 0) + 1,
          },
        }),
      ),
    );

    return NextResponse.json({ success: true, data: assignments }, { status: 201 });
  } catch (error) {
    console.error("[OPS][EXAM] Error assigning exam:", error);
    return NextResponse.json(
      { success: false, error: "Error al asignar examen" },
      { status: 500 },
    );
  }
}
