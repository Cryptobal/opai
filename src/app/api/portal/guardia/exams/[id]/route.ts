/**
 * API Route: /api/portal/guardia/exams/[id]
 * GET  - Get exam detail for guard to take (hides correct answers)
 * POST - Actions: open / submit
 *
 * Query: ?guardiaId=xxx
 */

import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";

type Params = { id: string };

export async function GET(
  request: NextRequest,
  { params }: { params: Promise<Params> },
) {
  try {
    const guardiaId = request.nextUrl.searchParams.get("guardiaId");
    if (!guardiaId) {
      return NextResponse.json(
        { success: false, error: "guardiaId requerido" },
        { status: 401 },
      );
    }

    const { id: assignmentId } = await params;

    const assignment = await prisma.opsExamAssignment.findUnique({
      where: { id: assignmentId },
      include: {
        exam: {
          include: {
            questions: { orderBy: { order: "asc" } },
            installation: { select: { name: true } },
          },
        },
      },
    });

    if (!assignment || assignment.guardId !== guardiaId) {
      return NextResponse.json(
        { success: false, error: "Examen no encontrado" },
        { status: 404 },
      );
    }

    // Hide correct answers unless completed
    const questions = assignment.exam.questions.map((q) => ({
      id: q.id,
      questionText: q.questionText,
      questionType: q.questionType,
      options: q.options,
      sectionReference: q.sectionReference,
      // Only show correct answer if already completed
      correctAnswer: assignment.status === "completed" ? q.correctAnswer : undefined,
    }));

    return NextResponse.json({
      success: true,
      data: {
        assignmentId: assignment.id,
        examId: assignment.exam.id,
        examTitle: assignment.exam.title,
        examType: assignment.exam.type,
        installationName: assignment.exam.installation.name,
        status: assignment.status,
        questions,
        // Include answers if completed (for review)
        answers: assignment.status === "completed" ? assignment.answers : undefined,
        score: assignment.status === "completed" ? Number(assignment.score) : undefined,
        timeTakenSeconds: assignment.timeTakenSeconds,
      },
    });
  } catch (error) {
    console.error("[PORTAL][GUARD] Error fetching exam:", error);
    return NextResponse.json(
      { success: false, error: "Error al obtener examen" },
      { status: 500 },
    );
  }
}

export async function POST(
  request: NextRequest,
  { params }: { params: Promise<Params> },
) {
  try {
    const guardiaId = request.nextUrl.searchParams.get("guardiaId");
    if (!guardiaId) {
      return NextResponse.json(
        { success: false, error: "guardiaId requerido" },
        { status: 401 },
      );
    }

    const { id: assignmentId } = await params;
    const body = await request.json();
    const { action } = body;

    // Verify ownership
    const assignment = await prisma.opsExamAssignment.findUnique({
      where: { id: assignmentId },
      include: {
        exam: {
          include: { questions: true },
        },
      },
    });

    if (!assignment || assignment.guardId !== guardiaId) {
      return NextResponse.json(
        { success: false, error: "Examen no encontrado" },
        { status: 404 },
      );
    }

    if (action === "open") {
      if (assignment.status === "sent") {
        const updated = await prisma.opsExamAssignment.update({
          where: { id: assignmentId },
          data: { status: "opened", openedAt: new Date() },
        });
        return NextResponse.json({ success: true, data: { status: updated.status } });
      }
      return NextResponse.json({ success: true, data: { status: assignment.status } });
    }

    if (action === "submit") {
      if (assignment.status === "completed") {
        return NextResponse.json(
          { success: false, error: "Este examen ya fue completado" },
          { status: 400 },
        );
      }

      const { answers, timeTakenSeconds } = body as {
        answers: Record<string, string>;
        timeTakenSeconds?: number;
      };

      if (!answers || typeof answers !== "object") {
        return NextResponse.json(
          { success: false, error: "Respuestas requeridas" },
          { status: 400 },
        );
      }

      // Calculate score
      let correct = 0;
      let total = 0;
      const questions = assignment.exam.questions;

      for (const q of questions) {
        total++;
        const guardAnswer = String(answers[q.id] ?? "");
        const correctAnswer = String(q.correctAnswer ?? "");
        if (guardAnswer === correctAnswer) {
          correct++;
        }
      }

      const score = total > 0 ? Math.round((correct / total) * 100) : 0;

      const updated = await prisma.opsExamAssignment.update({
        where: { id: assignmentId },
        data: {
          status: "completed",
          completedAt: new Date(),
          answers,
          score,
          timeTakenSeconds: timeTakenSeconds ?? null,
        },
      });

      // Return with correct answers for review
      const questionsWithAnswers = questions.map((q) => ({
        id: q.id,
        questionText: q.questionText,
        options: q.options,
        correctAnswer: q.correctAnswer,
        guardAnswer: answers[q.id] ?? null,
        isCorrect: String(answers[q.id] ?? "") === String(q.correctAnswer ?? ""),
      }));

      return NextResponse.json({
        success: true,
        data: {
          status: updated.status,
          score,
          correct,
          total,
          questions: questionsWithAnswers,
        },
      });
    }

    return NextResponse.json(
      { success: false, error: "Acción no válida" },
      { status: 400 },
    );
  } catch (error) {
    console.error("[PORTAL][GUARD] Error with exam action:", error);
    return NextResponse.json(
      { success: false, error: "Error al procesar examen" },
      { status: 500 },
    );
  }
}
