import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { requirePortalGuardiaAuth } from "@/lib/portal-guardia-auth";

type Params = { id: string };

/* ── GET /api/portal/guardia/exams/[id] ──────────────────────── */

export async function GET(
  request: NextRequest,
  { params }: { params: Promise<Params> },
) {
  try {
    const { id: assignmentId } = await params;
    const { searchParams } = new URL(request.url);
    const guardiaId = searchParams.get("guardiaId");

    const guardAuth = await requirePortalGuardiaAuth(guardiaId);
    if (!guardAuth) {
      return NextResponse.json(
        { success: false, error: "Guardia no encontrado o inactivo" },
        { status: 401 },
      );
    }

    const assignment = await prisma.examAssignment.findFirst({
      where: { id: assignmentId, guardId: guardAuth.guardiaId },
      include: {
        exam: {
          select: {
            title: true,
            type: true,
            passingScore: true,
            questions: {
              orderBy: { order: "asc" },
            },
          },
        },
      },
    });

    if (!assignment) {
      return NextResponse.json(
        { success: false, error: "Examen no encontrado" },
        { status: 404 },
      );
    }

    if (assignment.status === "completed") {
      const data = {
        id: assignment.id,
        examId: assignment.examId,
        title: assignment.exam.title,
        type: assignment.exam.type,
        passingScore: assignment.exam.passingScore,
        status: assignment.status,
        score: assignment.score,
        answers: assignment.answers,
        completedAt: assignment.completedAt?.toISOString() ?? null,
        timeTakenSecs: assignment.timeTakenSecs,
        attemptNumber: assignment.attemptNumber,
        questions: assignment.exam.questions.map((q) => ({
          id: q.id,
          questionText: q.questionText,
          questionType: q.questionType,
          options: q.options,
          correctAnswer: q.correctAnswer,
          order: q.order,
        })),
      };

      return NextResponse.json({ success: true, data });
    }

    const data = {
      id: assignment.id,
      examId: assignment.examId,
      title: assignment.exam.title,
      type: assignment.exam.type,
      passingScore: assignment.exam.passingScore,
      status: assignment.status,
      sentAt: assignment.sentAt.toISOString(),
      openedAt: assignment.openedAt?.toISOString() ?? null,
      attemptNumber: assignment.attemptNumber,
      questions: assignment.exam.questions.map((q) => ({
        id: q.id,
        questionText: q.questionText,
        questionType: q.questionType,
        options: q.options,
        order: q.order,
      })),
    };

    return NextResponse.json({ success: true, data });
  } catch (error) {
    console.error("[Portal Guardia] Exam detail GET error:", error);
    return NextResponse.json(
      { success: false, error: "Error al obtener examen" },
      { status: 500 },
    );
  }
}
