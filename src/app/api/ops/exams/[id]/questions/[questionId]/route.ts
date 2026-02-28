/**
 * API Route: /api/ops/exams/[id]/questions/[questionId]
 * PATCH  - Update question
 * DELETE - Delete question
 */

import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { requireAuth, unauthorized } from "@/lib/api-auth";

type Params = { id: string; questionId: string };

export async function PATCH(
  request: NextRequest,
  { params }: { params: Promise<Params> },
) {
  try {
    const ctx = await requireAuth();
    if (!ctx) return unauthorized();

    const { id, questionId } = await params;

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

    const existing = await prisma.opsExamQuestion.findFirst({
      where: { id: questionId, examId: id },
    });
    if (!existing) {
      return NextResponse.json(
        { success: false, error: "Pregunta no encontrada" },
        { status: 404 },
      );
    }

    const body = await request.json();
    const data: Record<string, unknown> = {};
    if (body.questionText !== undefined) data.questionText = body.questionText;
    if (body.questionType !== undefined) data.questionType = body.questionType;
    if (body.options !== undefined) data.options = body.options;
    if (body.correctAnswer !== undefined) data.correctAnswer = body.correctAnswer;
    if (body.sectionReference !== undefined) data.sectionReference = body.sectionReference;
    if (body.order !== undefined) data.order = body.order;

    const question = await prisma.opsExamQuestion.update({
      where: { id: questionId },
      data,
    });

    return NextResponse.json({ success: true, data: question });
  } catch (error) {
    console.error("[OPS][EXAM] Error updating question:", error);
    return NextResponse.json(
      { success: false, error: "Error al actualizar pregunta" },
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

    const { id, questionId } = await params;

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

    const existing = await prisma.opsExamQuestion.findFirst({
      where: { id: questionId, examId: id },
    });
    if (!existing) {
      return NextResponse.json(
        { success: false, error: "Pregunta no encontrada" },
        { status: 404 },
      );
    }

    await prisma.opsExamQuestion.delete({ where: { id: questionId } });

    return NextResponse.json({ success: true });
  } catch (error) {
    console.error("[OPS][EXAM] Error deleting question:", error);
    return NextResponse.json(
      { success: false, error: "Error al eliminar pregunta" },
      { status: 500 },
    );
  }
}
