/**
 * API Route: /api/ops/exams/[id]/questions
 * GET  - List questions for an exam
 * POST - Create a question manually
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
      return NextResponse.json({ success: false, error: "Sin permisos para ver preguntas" }, { status: 403 });
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

    const questions = await prisma.opsExamQuestion.findMany({
      where: { examId: id },
      orderBy: { order: "asc" },
    });

    return NextResponse.json({ success: true, data: questions });
  } catch (error) {
    console.error("[OPS][EXAM] Error fetching questions:", error);
    return NextResponse.json(
      { success: false, error: "Error al obtener preguntas" },
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
      return NextResponse.json({ success: false, error: "Solo administradores pueden crear preguntas" }, { status: 403 });
    }

    const { id } = await params;
    const body = await request.json();
    const { questionText, questionType, options, correctAnswer, sectionReference, order } = body;

    if (!questionText) {
      return NextResponse.json(
        { success: false, error: "questionText requerido" },
        { status: 400 },
      );
    }

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

    const question = await prisma.opsExamQuestion.create({
      data: {
        examId: id,
        questionText,
        questionType: questionType ?? "multiple_choice",
        options: options ?? null,
        correctAnswer: correctAnswer ?? null,
        sectionReference: sectionReference ?? null,
        source: "manual",
        order: order ?? 0,
      },
    });

    return NextResponse.json({ success: true, data: question }, { status: 201 });
  } catch (error) {
    console.error("[OPS][EXAM] Error creating question:", error);
    return NextResponse.json(
      { success: false, error: "Error al crear pregunta" },
      { status: 500 },
    );
  }
}
