import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";

type Params = { id: string };

/* ── POST /api/portal/guardia/exams/[id]/submit ──────────────── */

export async function POST(
  request: NextRequest,
  { params }: { params: Promise<Params> },
) {
  try {
    const { id: assignmentId } = await params;
    const { searchParams } = new URL(request.url);
    const guardiaId = searchParams.get("guardiaId");

    if (!guardiaId) {
      return NextResponse.json(
        { success: false, error: "guardiaId es requerido" },
        { status: 400 },
      );
    }

    const guardia = await prisma.opsGuardia.findUnique({
      where: { id: guardiaId },
      select: { id: true },
    });

    if (!guardia) {
      return NextResponse.json(
        { success: false, error: "Guardia no encontrado" },
        { status: 404 },
      );
    }

    const body = await request.json();
    const { answers } = body as { answers?: Record<string, number> };

    if (!answers || typeof answers !== "object") {
      return NextResponse.json(
        { success: false, error: "answers es requerido (objeto questionId -> respuesta)" },
        { status: 400 },
      );
    }

    const assignment = await prisma.examAssignment.findFirst({
      where: { id: assignmentId, guardId: guardiaId },
      include: {
        exam: {
          select: {
            id: true,
            passingScore: true,
            questions: { orderBy: { order: "asc" } },
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
      return NextResponse.json(
        { success: false, error: "Este examen ya fue completado" },
        { status: 400 },
      );
    }

    if (assignment.status === "expired") {
      return NextResponse.json(
        { success: false, error: "Este examen ha expirado" },
        { status: 400 },
      );
    }

    const questions = assignment.exam.questions;
    const total = questions.length;

    let correctCount = 0;
    const perQuestion = questions.map((q) => {
      const selected = answers[q.id];
      const isCorrect = selected === q.correctAnswer;
      if (isCorrect) correctCount++;
      return {
        questionId: q.id,
        selectedAnswer: selected ?? null,
        correctAnswer: q.correctAnswer,
        correct: isCorrect,
      };
    });

    const score = total > 0 ? Math.round((correctCount / total) * 100) : 0;
    const passed = score >= assignment.exam.passingScore;

    const now = new Date();
    const timeTakenSecs = assignment.openedAt
      ? Math.round((now.getTime() - assignment.openedAt.getTime()) / 1000)
      : null;

    await prisma.examAssignment.update({
      where: { id: assignmentId },
      data: {
        status: "completed",
        completedAt: now,
        score,
        answers: answers as Record<string, number>,
        timeTakenSecs,
      },
    });

    return NextResponse.json({
      success: true,
      data: {
        score,
        total,
        correctCount,
        passed,
        passingScore: assignment.exam.passingScore,
        timeTakenSecs,
        results: perQuestion,
      },
    });
  } catch (error) {
    console.error("[Portal Guardia] Exam submit POST error:", error);
    return NextResponse.json(
      { success: false, error: "Error al enviar respuestas" },
      { status: 500 },
    );
  }
}
