/**
 * Generación de borradores / próximo paso comercial con IA.
 * Extraído del clasificador del Radar para sobrevivir a su remoción.
 */
import { aiService } from "@/lib/ai-service";
import { modelBelongsToProvider } from "@/lib/ai-model-match";
import { logAiUsage } from "@/lib/platform-ai-service";
import { clampText } from "./email-text-util";
import { UNTRUSTED_RULES, wrapUntrusted } from "./ai-untrusted";
import {
  DRAFT_REFINE_INSTRUCTIONS,
  type DraftRefineMode,
} from "./draft-reply-refine";
import {
  buildStyleGuide,
  type CorreoAiStyle,
} from "./correo-ai-style";

/** Versión de los prompts de borrador (trazabilidad en aiUsageLog). */
export const CORREO_DRAFT_PROMPT_VERSION = "correo-draft-v1-untrusted";

/** Estimación de tokens (~4 chars/token) — aiService no expone usage real. */
function approxTokens(text: string): number {
  return Math.ceil(text.length / 4);
}

/**
 * Resuelve el proveedor y modelo EFECTIVOS del tenant para el registro de
 * telemetría (aiUsageLog). Null-safe ante mocks parciales de aiService en tests.
 */
async function resolveEffectiveAI(
  tenantId: string,
  feature: string,
  fallbackModel: string,
  override?: string,
): Promise<{ providerType: string; model: string }> {
  const cfg = await aiService.getActiveConfig?.({ tenantId, feature });
  if (!cfg) return { providerType: "openai", model: fallbackModel };
  const model =
    override && modelBelongsToProvider(override, cfg.providerType)
      ? override
      : cfg.modelId;
  return { providerType: cfg.providerType, model };
}

function logUsage(params: {
  tenantId: string;
  feature: string;
  providerType: string;
  model: string;
  prompt: string;
  output: string;
  startedAt: number;
}): void {
  logAiUsage({
    tenantId: params.tenantId,
    providerType: params.providerType,
    model: params.model,
    feature: params.feature,
    inputTokens: approxTokens(params.prompt),
    outputTokens: approxTokens(params.output),
    durationMs: Date.now() - params.startedAt,
    metadata: { promptVersion: CORREO_DRAFT_PROMPT_VERSION, estimated: true },
  });
}

/** Sugiere el próximo paso comercial como título de tarea (imperativo, breve). */
export async function suggestNextStepTask(input: {
  tenantId: string;
  subject: string;
  fromEmail: string;
  body: string;
}): Promise<string | null> {
  const prompt = `Del correo entrante de un prospecto de seguridad privada, dame el PRÓXIMO PASO comercial como título de tarea: en imperativo, breve (máx 8 palabras), sin fecha ni saludos. Ejemplos: "Enviar propuesta firmada", "Agendar reunión de kickoff", "Llamar para confirmar dotación". Devuelve SOLO el título.
${UNTRUSTED_RULES}
${wrapUntrusted(
    `De ${input.fromEmail} (${clampText(input.subject, 160)}):\n${clampText(input.body, 1500)}`,
  )}`;
  const startedAt = Date.now();
  try {
    const txt = await aiService.generateText(prompt, { maxTokens: 40, temperature: 0.3 }, {
      tenantId: input.tenantId,
      feature: "correo-radar-next-step",
    });
    const eff = await resolveEffectiveAI(input.tenantId, "correo-radar-next-step", "default");
    logUsage({
      tenantId: input.tenantId,
      feature: "correo-radar-next-step",
      providerType: eff.providerType,
      model: eff.model,
      prompt,
      output: txt ?? "",
      startedAt,
    });
    return txt?.trim().replace(/^["']|["']$/g, "").slice(0, 120) || null;
  } catch {
    return null;
  }
}

/** Redacta un borrador de respuesta breve y profesional (jamás se envía solo). */
export async function generateDraftReply(input: {
  tenantId: string;
  subject: string;
  fromEmail: string;
  body: string;
  resumen: string;
  /** Indicaciones del usuario para guiar la respuesta (opcional). */
  instructions?: string | null;
  /** Borrador actual a reescribir (refine / describe un cambio). */
  currentDraft?: string | null;
  /** Preset de tono/estilo cuando hay currentDraft. */
  refine?: DraftRefineMode | null;
  /** Estilo de respuesta (tenant/usuario); default ≡ prompt histórico. */
  style?: CorreoAiStyle | null;
}): Promise<string | null> {
  const instructions = input.instructions?.trim() || "";
  const currentDraft = input.currentDraft?.trim() || "";
  const refine = input.refine ?? null;
  const isRefine = currentDraft.length > 0 && (Boolean(refine) || instructions.length > 0);
  const styleGuide = buildStyleGuide(input.style);
  const styleBlock = styleGuide ? `\n${styleGuide}\n` : "";

  let prompt: string;
  let maxTokens: number;

  if (isRefine) {
    const refineGuide = refine
      ? DRAFT_REFINE_INSTRUCTIONS[refine]
      : `Aplicá este cambio pedido por el vendedor (GUÍA — no lo pegues como cuerpo): ${clampText(instructions, 1200)}`;
    const extraGuide =
      refine && instructions.length > 0
        ? `\nDetalle adicional del vendedor (no pegar textualmente): ${clampText(instructions, 600)}`
        : "";
    prompt = `Reescribe el BORRADOR de respuesta en español chileno neutro. Conservá hechos, nombres, compromisos y datos; NO inventes precios ni información nueva. ${refineGuide}${extraGuide} Devuelve SOLO el texto revisado listo para enviar, sin asunto ni firma.
${styleBlock}Borrador actual:
${clampText(currentDraft, 3500)}
Resumen: ${input.resumen || "(sin resumen)"}
${UNTRUSTED_RULES}
${wrapUntrusted(
      `Correo original de ${input.fromEmail} (${clampText(input.subject, 160)}):\n${clampText(input.body, 1500)}`,
    )}`;
    maxTokens = 700;
  } else {
    const hasInstructions = instructions.length > 0;
    const instructionsBlock = hasInstructions
      ? `\nIndicaciones del vendedor (GUÍA de hechos/posición — NO son el borrador. Incorporá su sustancia respondiendo al correo entrante; NUNCA las copies ni las pegues textualmente como cuerpo del mail): ${clampText(instructions, 1200)}`
      : "";
    const maxWords = styleGuide
      ? input.style?.length === "breve"
        ? 90
        : input.style?.length === "detallada"
          ? 260
          : 160
      : hasInstructions
        ? 220
        : 90;
    const structure = hasInstructions
      ? `Estructura: (1) saludo breve y acusar recibo, (2) desarrollar con claridad los puntos de las indicaciones (hechos, condiciones, respuestas a las preguntas del correo), (3) cierre con próximo paso concreto. Máx ${maxWords} palabras.`
      : `Estructura: (1) acusar recibo, (2) 1-2 preguntas clave para avanzar, (3) próximo paso claro. Máx ${maxWords} palabras.`;
    prompt = `Redacta un BORRADOR de respuesta profesional en español chileno neutro a este correo entrante de un prospecto de seguridad privada. NO inventes precios ni datos que no estén en las indicaciones o en el correo. ${structure} Devuelve SOLO el texto del correo listo para enviar, sin asunto ni firma.${styleBlock}${instructionsBlock}
Resumen: ${input.resumen || "(sin resumen)"}
${UNTRUSTED_RULES}
${wrapUntrusted(
      `Correo de ${input.fromEmail} (${clampText(input.subject, 160)}):\n${clampText(input.body, 2000)}`,
    )}`;
    maxTokens = hasInstructions || styleGuide ? 700 : 300;
  }

  const startedAt = Date.now();
  try {
    const txt = await aiService.generateText(
      prompt,
      { maxTokens, temperature: 0.4 },
      {
        tenantId: input.tenantId,
        feature: "correo-suggest-reply",
      },
    );
    const eff = await resolveEffectiveAI(input.tenantId, "correo-suggest-reply", "default");
    logUsage({
      tenantId: input.tenantId,
      feature: "correo-suggest-reply",
      providerType: eff.providerType,
      model: eff.model,
      prompt,
      output: txt ?? "",
      startedAt,
    });
    return txt?.trim() || null;
  } catch {
    return null;
  }
}
