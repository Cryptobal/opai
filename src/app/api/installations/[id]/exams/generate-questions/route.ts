import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import { prisma } from "@/lib/prisma";
import { aiService } from "@/lib/ai-service";
import { AIError } from "@/lib/ai-errors";
import {
  requireAuth,
  unauthorized,
  resolveApiPerms,
  parseBody,
} from "@/lib/api-auth";
import { canEdit } from "@/lib/permissions";

type Params = { id: string };

const generateSchema = z.object({
  questionCount: z.number().int().min(1).max(50).default(10),
  type: z.enum(["protocol", "security_general"]).optional().default("protocol"),
  documentIds: z.array(z.string()).optional(),
});

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
        { success: false, error: "Sin permisos para generar preguntas" },
        { status: 403 },
      );
    }

    const { id } = await params;
    const { data, error } = await parseBody(request, generateSchema);
    if (error) return error;

    const { questionCount, type, documentIds } = data;

    type QuestionResult = {
      questions: Array<{
        question: string;
        type: string;
        options: string[];
        correct_answer: number;
        section_reference: string;
      }>;
    };

    let result: QuestionResult = { questions: [] };

    if (type === "security_general") {
      const whereClause = documentIds && documentIds.length > 0
        ? { tenantId: ctx.tenantId, scope: "global" as const, id: { in: documentIds } }
        : { tenantId: ctx.tenantId, scope: "global" as const };

      const globalDocs = await prisma.protocolDocument.findMany({ where: whereClause });

      if (globalDocs.length === 0) {
        return NextResponse.json(
          {
            success: false,
            error:
              "No hay documentos globales para generar preguntas de seguridad general. Sube documentos en Configuración → Documentos Globales.",
          },
          { status: 400 },
        );
      }

      const jsonFormat = `{"questions":[{"question":"...","type":"multiple_choice","options":["A","B","C","D"],"correct_answer":0,"section_reference":"seguridad general"}]}`;

      const docWithUrl = globalDocs.find((d) => d.fileUrl);
      let generatedFromDoc = false;

      if (docWithUrl) {
        try {
          const pdfRes = await fetch(docWithUrl.fileUrl);
          const pdfBase64 = Buffer.from(await pdfRes.arrayBuffer()).toString("base64");

          const docPrompt = `Basándote en el contenido de este documento de seguridad (OS10, manual de seguridad privada Chile), genera ${questionCount} preguntas de evaluación para guardias de seguridad.
Responde ÚNICAMENTE con el siguiente JSON válido:
${jsonFormat}

Reglas:
- Las preguntas deben ser prácticas y situacionales
- Las opciones incorrectas deben ser plausibles
- correct_answer es el índice (0-3) de la opción correcta
- section_reference debe indicar el tema o sección del documento`;

          result = (await aiService.processDocument(pdfBase64, docPrompt, 4000, { tenantId: ctx.tenantId })) as QuestionResult;
          generatedFromDoc = true;
        } catch (docError) {
          console.error("[EXAMS] Error processing global document, falling back to general prompt:", docError);
        }
      }

      if (!generatedFromDoc) {
        const fallbackPrompt = `Genera ${questionCount} preguntas de evaluación de seguridad general para guardias de seguridad privada en Chile, basándote en conocimientos de la OS10, procedimientos de seguridad, control de acceso, rondas, y normativa vigente.
Responde ÚNICAMENTE con el siguiente JSON válido:
${jsonFormat}

Reglas:
- Las preguntas deben ser prácticas y situacionales
- Las opciones incorrectas deben ser plausibles
- correct_answer es el índice (0-3) de la opción correcta
- section_reference debe indicar el tema general`;

        result = (await aiService.generateJSON(fallbackPrompt, 4000, { tenantId: ctx.tenantId })) as QuestionResult;
      }
    } else {
      const sections = await prisma.protocolSection.findMany({
        where: { installationId: id },
        include: { items: { orderBy: { order: "asc" } } },
        orderBy: { order: "asc" },
      });

      if (sections.length === 0) {
        return NextResponse.json(
          { success: false, error: "No hay secciones de protocolo para generar preguntas" },
          { status: 400 },
        );
      }

      const protocolSummary = sections.map((s) => ({
        section: s.title,
        items: s.items.map((item) => ({
          title: item.title,
          description: item.description,
        })),
      }));

      const prompt = `Dado este protocolo de seguridad:
${JSON.stringify(protocolSummary)}

Genera ${questionCount} preguntas de evaluación para guardias de seguridad.
Responde ÚNICAMENTE con el siguiente JSON válido:
{"questions":[{"question":"...","type":"multiple_choice","options":["A","B","C","D"],"correct_answer":0,"section_reference":"nombre de la sección"}]}

Reglas:
- Las preguntas deben ser prácticas y situacionales
- Las opciones incorrectas deben ser plausibles
- correct_answer es el índice (0-3) de la opción correcta
- section_reference debe coincidir con una sección del protocolo`;

      result = (await aiService.generateJSON(prompt, 4000, { tenantId: ctx.tenantId })) as QuestionResult;
    }

    const questions = (result.questions ?? []).map((q, i) => ({
      questionText: q.question,
      questionType: q.type || "multiple_choice",
      options: q.options,
      correctAnswer: q.correct_answer,
      sectionRef: q.section_reference,
      order: i,
      source: "ai_generated" as const,
    }));

    return NextResponse.json({ success: true, data: { questions } });
  } catch (error) {
    if (error instanceof AIError) {
      return NextResponse.json(error.toResponse(), { status: error.clientHttpStatus });
    }
    console.error("[EXAMS] Error generating questions:", error);
    const message = error instanceof Error && error.message === "NO_AI_CONFIGURED"
      ? "No hay servicio de IA configurado"
      : "No se pudieron generar las preguntas";
    return NextResponse.json(
      { success: false, error: message, code: "INTERNAL_ERROR" },
      { status: 500 },
    );
  }
}
