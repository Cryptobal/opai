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
import {
  getAiKnowledgeSources,
  rankSourcesForPrompt,
  type AiKnowledgeSource,
} from "@/lib/protocols/ai-knowledge-sources";

type Params = { id: string };

const generateSchema = z.object({
  questionCount: z.number().int().min(1).max(50).default(10),
  type: z.enum(["protocol", "security_general"]).optional().default("protocol"),
  documentIds: z.array(z.string()).optional(),
});

type ApiQuestion = {
  question: string;
  type: string;
  options: string[];
  correct_answer: number;
  section_reference: string;
};

type QuestionResult = { questions: ApiQuestion[] };

const JSON_FORMAT = `{"questions":[{"question":"...","type":"multiple_choice","options":["A","B","C","D"],"correct_answer":0,"section_reference":"seguridad general"}]}`;

function buildSecurityPrompt(
  questionCount: number,
  source: AiKnowledgeSource | null,
): string {
  const sourceContext = source
    ? `Documento de referencia: "${source.fileName}"${source.tipoNombre ? ` (${source.tipoNombre})` : ""}.`
    : "";

  return `Eres un experto senior en seguridad privada en Chile redactando preguntas de evaluación para guardias.

${sourceContext}

Genera ${questionCount} preguntas de selección múltiple basándote ${
    source
      ? "ESTRICTAMENTE en el contenido del documento adjunto"
      : "en la normativa chilena vigente (Ley 21.659 de Seguridad Privada, OS-10, Ley 16.744)"
  }. Las preguntas deben ser prácticas, situacionales y útiles para evaluar el desempeño de un guardia.

Responde ÚNICAMENTE con el siguiente JSON válido (sin markdown, sin backticks, sin texto adicional):
${JSON_FORMAT}

Reglas:
- correct_answer es el índice (0-3) de la opción correcta.
- Las opciones incorrectas deben ser plausibles pero claramente distinguibles.
- section_reference: ${source ? "tema o sección del documento" : "tema general (control de acceso, emergencias, normativa, etc.)"}.
- No repitas preguntas. No uses lenguaje de blog ni adjetivos vacíos.`;
}

async function fetchPdfBase64(url: string): Promise<string> {
  const res = await fetch(url);
  if (!res.ok) throw new Error(`PDF fetch failed: ${res.status}`);
  return Buffer.from(await res.arrayBuffer()).toString("base64");
}

/**
 * Distribuye `total` preguntas entre N documentos. La primera fuente recibe
 * el redondeo extra para que la suma sea exactamente `total`.
 */
function distributeQuestionCounts(total: number, n: number): number[] {
  if (n <= 0) return [];
  const base = Math.floor(total / n);
  const extra = total - base * n;
  return Array.from({ length: n }, (_, i) => base + (i < extra ? 1 : 0));
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
        { success: false, error: "Sin permisos para generar preguntas" },
        { status: 403 },
      );
    }

    const { id } = await params;
    const { data, error } = await parseBody(request, generateSchema);
    if (error) return error;

    const { questionCount, type, documentIds } = data;

    let result: QuestionResult = { questions: [] };
    let usedSources: AiKnowledgeSource[] = [];

    if (type === "security_general") {
      const sources = await getAiKnowledgeSources({
        tenantId: ctx.tenantId,
        installationId: id,
        documentIds,
      });

      if (sources.length === 0) {
        return NextResponse.json(
          {
            success: false,
            error:
              "No hay documentos disponibles para generar preguntas. Sube documentos y activa el switch \"Usar como base de IA\" en Configuración → Documentos Operacionales.",
          },
          { status: 400 },
        );
      }

      // Tope de 3 PDFs por examen para no explotar tokens. Priorizamos por
      // relevancia (matriz_riesgo > plan_emergencia > plan_evacuacion > ...).
      const ranked = rankSourcesForPrompt(sources).slice(0, 3);
      const counts = distributeQuestionCounts(questionCount, ranked.length);

      const aggregated: ApiQuestion[] = [];
      let processedAtLeastOne = false;

      for (let i = 0; i < ranked.length; i += 1) {
        const source = ranked[i];
        const target = counts[i];
        if (target <= 0) continue;
        try {
          const pdfBase64 = await fetchPdfBase64(source.fileUrl);
          const docPrompt = buildSecurityPrompt(target, source);
          const partial = (await aiService.processDocument(
            pdfBase64,
            docPrompt,
            4096,
            { tenantId: ctx.tenantId },
          )) as QuestionResult;
          if (partial?.questions?.length) {
            aggregated.push(...partial.questions);
            usedSources.push(source);
            processedAtLeastOne = true;
          }
        } catch (docErr) {
          console.error(
            `[EXAMS] Error processing source ${source.fileName}:`,
            docErr,
          );
        }
      }

      if (!processedAtLeastOne) {
        // Fallback texto puro si todos los PDFs fallaron al procesarse.
        const fallbackPrompt = buildSecurityPrompt(questionCount, null);
        result = (await aiService.generateJSON(fallbackPrompt, 4096, {
          tenantId: ctx.tenantId,
        })) as QuestionResult;
      } else {
        result = { questions: aggregated.slice(0, questionCount) };
      }
    } else {
      const sections = await prisma.protocolSection.findMany({
        where: { installationId: id },
        include: { items: { orderBy: { order: "asc" } } },
        orderBy: { order: "asc" },
      });

      if (sections.length === 0) {
        return NextResponse.json(
          {
            success: false,
            error: "No hay secciones de protocolo para generar preguntas",
          },
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

      result = (await aiService.generateJSON(prompt, 4000, {
        tenantId: ctx.tenantId,
      })) as QuestionResult;
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

    // Devolvemos también las fuentes usadas para que el cliente las pueda
    // pasar al endpoint POST /exams (BLOQUE 4 - opción A) y queden
    // persistidas en `exam_source_documents`.
    const sourcesPayload = usedSources.map((s) => ({
      id: s.id,
      origin: s.origin,
      fileName: s.fileName,
    }));

    return NextResponse.json({
      success: true,
      data: { questions, sources: sourcesPayload },
    });
  } catch (error) {
    if (error instanceof AIError) {
      return NextResponse.json(error.toResponse(), {
        status: error.clientHttpStatus,
      });
    }
    console.error("[EXAMS] Error generating questions:", error);
    const message =
      error instanceof Error && error.message === "NO_AI_CONFIGURED"
        ? "No hay servicio de IA configurado"
        : "No se pudieron generar las preguntas";
    return NextResponse.json(
      { success: false, error: message, code: "INTERNAL_ERROR" },
      { status: 500 },
    );
  }
}
