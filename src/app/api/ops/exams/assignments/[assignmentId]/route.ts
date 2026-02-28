/**
 * API Route: /api/ops/exams/assignments/[assignmentId]
 * GET   - Get assignment details (for guard taking the exam)
 * PATCH - Submit exam answers / update status
 *
 * PATCH body for submission:
 * { action: "submit", answers: {...}, timeTakenSeconds: number }
 *
 * PATCH body for status update (admin):
 * { action: "open" } - marks as opened
 */

import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { requireAuth, unauthorized } from "@/lib/api-auth";

type Params = { assignmentId: string };

export async function GET(
  _request: NextRequest,
  { params }: { params: Promise<Params> },
) {
  try {
    const ctx = await requireAuth();
    if (!ctx) return unauthorized();

    const { assignmentId } = await params;

    const assignment = await prisma.opsExamAssignment.findFirst({
      where: { id: assignmentId, tenantId: ctx.tenantId },
      include: {
        exam: {
          include: {
            questions: { orderBy: { order: "asc" } },
            installation: { select: { id: true, name: true } },
          },
        },
        guard: {
          include: {
            persona: { select: { firstName: true, lastName: true } },
          },
        },
      },
    });

    if (!assignment) {
      return NextResponse.json(
        { success: false, error: "Asignación no encontrada" },
        { status: 404 },
      );
    }

    // If guard is viewing (not admin), strip correct answers
    // For simplicity, we strip correct answers if the exam hasn't been completed
    const data = { ...assignment } as Record<string, unknown>;
    if (assignment.status !== "completed") {
      const exam = assignment.exam;
      data.exam = {
        ...exam,
        questions: exam.questions.map((q) => ({
          ...q,
          correctAnswer: null, // hide until completed
        })),
      };
    }

    return NextResponse.json({ success: true, data });
  } catch (error) {
    console.error("[OPS][EXAM] Error fetching assignment:", error);
    return NextResponse.json(
      { success: false, error: "Error al obtener asignación" },
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

    const { assignmentId } = await params;
    const body = await request.json();
    const { action } = body;

    const assignment = await prisma.opsExamAssignment.findFirst({
      where: { id: assignmentId, tenantId: ctx.tenantId },
      include: {
        exam: {
          include: { questions: true },
        },
      },
    });

    if (!assignment) {
      return NextResponse.json(
        { success: false, error: "Asignación no encontrada" },
        { status: 404 },
      );
    }

    if (action === "open") {
      if (assignment.status !== "sent") {
        return NextResponse.json(
          { success: false, error: "El examen ya fue abierto" },
          { status: 400 },
        );
      }

      const updated = await prisma.opsExamAssignment.update({
        where: { id: assignmentId },
        data: { status: "opened", openedAt: new Date() },
      });

      return NextResponse.json({ success: true, data: updated });
    }

    if (action === "submit") {
      if (assignment.status === "completed") {
        return NextResponse.json(
          { success: false, error: "El examen ya fue completado" },
          { status: 400 },
        );
      }

      const { answers, timeTakenSeconds } = body as {
        answers: Record<string, string>;
        timeTakenSeconds?: number;
      };

      if (!answers || typeof answers !== "object") {
        return NextResponse.json(
          { success: false, error: "answers requerido (objeto con questionId: answer)" },
          { status: 400 },
        );
      }

      // Calculate score
      const questions = assignment.exam.questions;
      let correctCount = 0;
      for (const q of questions) {
        const guardAnswer = answers[q.id];
        if (guardAnswer !== undefined && guardAnswer === q.correctAnswer) {
          correctCount++;
        }
      }

      const score = questions.length > 0
        ? (correctCount / questions.length) * 100
        : 0;

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

      return NextResponse.json({ success: true, data: updated });
    }

    return NextResponse.json(
      { success: false, error: "action inválido. Use 'open' o 'submit'" },
      { status: 400 },
    );
  } catch (error) {
    console.error("[OPS][EXAM] Error updating assignment:", error);
    return NextResponse.json(
      { success: false, error: "Error al actualizar asignación" },
      { status: 500 },
    );
  }
}
