/**
 * API Route: /api/ops/exams/[id]/ai-questions
 * POST - Generate exam questions with AI
 *
 * Body: { questionCount?, topic? }
 * For protocol exams: generates from the installation's protocol.
 * For security_general: generates from the given topic.
 * Saves questions to the exam and returns them.
 */

import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { requireAuth, unauthorized } from "@/lib/api-auth";
import {
  generateExamQuestions,
  generateSecurityGeneralQuestions,
  type AiProtocolSection,
} from "@/lib/protocol-ai";

type Params = { id: string };

export async function POST(
  request: NextRequest,
  { params }: { params: Promise<Params> },
) {
  try {
    const ctx = await requireAuth();
    if (!ctx) return unauthorized();

    const { id } = await params;
    const body = await request.json();
    const { questionCount = 10, topic } = body;

    // Fetch exam with installation
    const exam = await prisma.opsExam.findFirst({
      where: { id, tenantId: ctx.tenantId },
      include: {
        installation: { select: { id: true, name: true } },
      },
    });
    if (!exam) {
      return NextResponse.json(
        { success: false, error: "Examen no encontrado" },
        { status: 404 },
      );
    }

    let result;

    if (exam.type === "protocol") {
      // Fetch protocol sections for this installation
      const sections = await prisma.opsProtocolSection.findMany({
        where: { tenantId: ctx.tenantId, installationId: exam.installationId },
        include: { items: { orderBy: { order: "asc" } } },
        orderBy: { order: "asc" },
      });

      if (sections.length === 0) {
        return NextResponse.json(
          { success: false, error: "No hay protocolo definido para esta instalación. Crea el protocolo primero." },
          { status: 400 },
        );
      }

      const protocolSections: AiProtocolSection[] = sections.map((s) => ({
        title: s.title,
        icon: s.icon ?? "",
        items: s.items.map((i) => ({
          title: i.title,
          description: i.description ?? "",
        })),
      }));

      result = await generateExamQuestions(
        exam.installation.name,
        protocolSections,
        questionCount,
      );
    } else {
      // security_general
      if (!topic) {
        return NextResponse.json(
          { success: false, error: "topic requerido para exámenes de seguridad general" },
          { status: 400 },
        );
      }
      result = await generateSecurityGeneralQuestions(topic, questionCount);
    }

    // Get current max order
    const maxOrder = await prisma.opsExamQuestion.findFirst({
      where: { examId: id },
      orderBy: { order: "desc" },
      select: { order: true },
    });
    const startOrder = (maxOrder?.order ?? -1) + 1;

    // Save questions
    const questions = await prisma.$transaction(
      result.questions.map((q, idx) =>
        prisma.opsExamQuestion.create({
          data: {
            examId: id,
            questionText: q.questionText,
            questionType: q.questionType,
            options: q.options,
            correctAnswer: q.correctAnswer,
            sectionReference: q.sectionReference ?? null,
            source: "ai_generated",
            order: startOrder + idx,
          },
        }),
      ),
    );

    return NextResponse.json({ success: true, data: questions }, { status: 201 });
  } catch (error) {
    console.error("[OPS][EXAM] Error AI generating questions:", error);
    const msg = error instanceof Error ? error.message : "Error al generar preguntas con IA";
    return NextResponse.json(
      { success: false, error: msg },
      { status: 500 },
    );
  }
}
