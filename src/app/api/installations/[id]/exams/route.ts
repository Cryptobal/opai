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

type Params = { id: string };

const questionSchema = z.object({
  questionText: z.string().min(1),
  questionType: z.enum(["multiple_choice", "true_false"]).default("multiple_choice"),
  options: z.any(),
  correctAnswer: z.number().int().min(0),
  sectionRef: z.string().optional(),
  order: z.number().int().min(0).default(0),
});

const createExamSchema = z.object({
  title: z.string().min(1).max(300),
  type: z.enum(["protocol", "security_general"]).default("protocol"),
  scheduleType: z.enum(["manual", "on_assignment", "recurring"]).default("manual"),
  recurringMonths: z.number().int().positive().optional(),
  passingScore: z.number().int().min(0).max(100).default(60),
  questions: z.array(questionSchema).optional(),
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

    const { id } = await params;

    const exams = await prisma.exam.findMany({
      where: { installationId: id },
      include: {
        _count: { select: { questions: true, assignments: true } },
        assignments: { select: { score: true, status: true } },
      },
      orderBy: { createdAt: "desc" },
    });

    const data = exams.map((exam) => {
      const completed = exam.assignments.filter((a) => a.status === "completed");
      const scores = completed.map((a) => a.score).filter((s): s is number => s !== null);

      return {
        id: exam.id,
        title: exam.title,
        type: exam.type,
        status: exam.status,
        scheduleType: exam.scheduleType,
        recurringMonths: exam.recurringMonths,
        passingScore: exam.passingScore,
        createdAt: exam.createdAt,
        updatedAt: exam.updatedAt,
        questionCount: exam._count.questions,
        sentCount: exam._count.assignments,
        completedCount: completed.length,
        avgScore: scores.length > 0
          ? Math.round((scores.reduce((a, b) => a + b, 0) / scores.length) * 10) / 10
          : null,
      };
    });

    return NextResponse.json({ success: true, data });
  } catch (error) {
    console.error("[EXAMS] Error listing exams:", error);
    return NextResponse.json(
      { success: false, error: "No se pudieron obtener los exámenes" },
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

    if (!canEdit(perms, "crm", "installations")) {
      return NextResponse.json(
        { success: false, error: "Sin permisos para crear exámenes" },
        { status: 403 },
      );
    }

    const { id } = await params;
    const { data, error } = await parseBody(request, createExamSchema);
    if (error) return error;

    const exam = await prisma.$transaction(async (tx) => {
      const created = await tx.exam.create({
        data: {
          installationId: id,
          title: data.title,
          type: data.type,
          scheduleType: data.scheduleType,
          recurringMonths: data.recurringMonths,
          passingScore: data.passingScore,
          createdBy: ctx.userId,
        },
      });

      if (data.questions?.length) {
        await tx.examQuestion.createMany({
          data: data.questions.map((q, i) => ({
            examId: created.id,
            questionText: q.questionText,
            questionType: q.questionType,
            options: q.options,
            correctAnswer: q.correctAnswer,
            sectionRef: q.sectionRef,
            order: q.order ?? i,
            source: "manual",
          })),
        });
      }

      return tx.exam.findUnique({
        where: { id: created.id },
        include: {
          questions: { orderBy: { order: "asc" } },
          _count: { select: { questions: true } },
        },
      });
    });

    return NextResponse.json({ success: true, data: exam }, { status: 201 });
  } catch (error) {
    console.error("[EXAMS] Error creating exam:", error);
    return NextResponse.json(
      { success: false, error: "No se pudo crear el examen" },
      { status: 500 },
    );
  }
}
