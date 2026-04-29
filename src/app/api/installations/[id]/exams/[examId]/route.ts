import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import { prisma } from "@/lib/prisma";
import {
  requireAuth,
  unauthorized,
  resolveApiPerms,
  parseBody,
} from "@/lib/api-auth";
import { canView, canEdit } from "@/lib/permissions";

type Params = { id: string; examId: string };

const updateExamSchema = z.object({
  title: z.string().min(1).max(300).optional(),
  status: z.enum(["draft", "active", "archived"]).optional(),
  scheduleType: z.enum(["manual", "on_assignment", "recurring"]).optional(),
  recurringMonths: z.number().int().positive().nullable().optional(),
  recurringDays: z.number().int().positive().nullable().optional(),
  passingScore: z.number().int().min(0).max(100).optional(),
});

export async function GET(
  _request: NextRequest,
  { params }: { params: Promise<Params> },
) {
  try {
    const ctx = await requireAuth();
    if (!ctx) return unauthorized();
    const perms = await resolveApiPerms(ctx);

    if (!canView(perms, "crm", "installations")) {
      return NextResponse.json(
        { success: false, error: "Sin permisos para ver exámenes" },
        { status: 403 },
      );
    }

    const { examId } = await params;

    const exam = await prisma.exam.findUnique({
      where: { id: examId },
      include: {
        questions: { orderBy: { order: "asc" } },
        assignments: {
          include: {
            guard: {
              include: { persona: { select: { firstName: true, lastName: true } } },
            },
          },
          orderBy: { sentAt: "desc" },
        },
      },
    });

    if (!exam) {
      return NextResponse.json(
        { success: false, error: "Examen no encontrado" },
        { status: 404 },
      );
    }

    const completed = exam.assignments.filter((a) => a.status === "completed");
    const scores = completed.map((a) => a.score).filter((s): s is number => s !== null);

    return NextResponse.json({
      success: true,
      data: {
        ...exam,
        stats: {
          questionCount: exam.questions.length,
          sentCount: exam.assignments.length,
          completedCount: completed.length,
          avgScore: scores.length > 0
            ? Math.round((scores.reduce((a, b) => a + b, 0) / scores.length) * 10) / 10
            : null,
        },
      },
    });
  } catch (error) {
    console.error("[EXAMS] Error fetching exam:", error);
    return NextResponse.json(
      { success: false, error: "No se pudo obtener el examen" },
      { status: 500 },
    );
  }
}

export async function PUT(
  request: NextRequest,
  { params }: { params: Promise<Params> },
) {
  try {
    const ctx = await requireAuth();
    if (!ctx) return unauthorized();
    const perms = await resolveApiPerms(ctx);

    if (!canEdit(perms, "crm", "installations")) {
      return NextResponse.json(
        { success: false, error: "Sin permisos para editar exámenes" },
        { status: 403 },
      );
    }

    const { examId } = await params;
    const { data, error } = await parseBody(request, updateExamSchema);
    if (error) return error;

    const existing = await prisma.exam.findUnique({ where: { id: examId } });
    if (!existing) {
      return NextResponse.json(
        { success: false, error: "Examen no encontrado" },
        { status: 404 },
      );
    }

    const exam = await prisma.exam.update({
      where: { id: examId },
      data: {
        ...(data.title !== undefined && { title: data.title }),
        ...(data.status !== undefined && { status: data.status }),
        ...(data.scheduleType !== undefined && { scheduleType: data.scheduleType }),
        ...(data.recurringMonths !== undefined && { recurringMonths: data.recurringMonths }),
        ...(data.recurringDays !== undefined && { recurringDays: data.recurringDays }),
        ...(data.passingScore !== undefined && { passingScore: data.passingScore }),
      },
      include: {
        questions: { orderBy: { order: "asc" } },
        _count: { select: { questions: true, assignments: true } },
      },
    });

    return NextResponse.json({ success: true, data: exam });
  } catch (error) {
    console.error("[EXAMS] Error updating exam:", error);
    return NextResponse.json(
      { success: false, error: "No se pudo actualizar el examen" },
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

    if (!canEdit(perms, "crm", "installations")) {
      return NextResponse.json(
        { success: false, error: "Sin permisos para eliminar exámenes" },
        { status: 403 },
      );
    }

    const { examId } = await params;

    const existing = await prisma.exam.findUnique({ where: { id: examId } });
    if (!existing) {
      return NextResponse.json(
        { success: false, error: "Examen no encontrado" },
        { status: 404 },
      );
    }

    await prisma.exam.delete({ where: { id: examId } });

    return NextResponse.json({ success: true, data: { deleted: true } });
  } catch (error) {
    console.error("[EXAMS] Error deleting exam:", error);
    return NextResponse.json(
      { success: false, error: "No se pudo eliminar el examen" },
      { status: 500 },
    );
  }
}
