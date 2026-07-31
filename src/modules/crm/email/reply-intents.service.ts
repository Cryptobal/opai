/**
 * Intenciones de respuesta del lector (chips "Sugerir respuestas").
 *
 * On-demand y cacheadas por último mensaje del hilo, con la misma semántica
 * que `aiThreadSummary`: reabrir el hilo sin mensajes nuevos NO vuelve a
 * llamar al modelo (`cached: true`). Nunca redacta ni envía: solo propone
 * 3 intenciones cortas que después alimentan `suggest-reply`.
 *
 * Contenido externo delimitado como no confiable (A13) y costo loggeado con el
 * proveedor EFECTIVO del tenant (nunca un literal fijo).
 */
import { prisma } from "@/lib/prisma";
import { aiService } from "@/lib/ai-service";
import { logAiUsage } from "@/lib/platform-ai-service";
import { UNTRUSTED_RULES, wrapUntrusted } from "./ai-untrusted";
import { buildTranscript } from "./email-summary.service";

const INTENTS_PROMPT_VERSION = "reply-intents-v1";
const INTENTS_FEATURE = "correo-reply-intents";
/** El chip muestra 3 opciones + "Desde cero"; más no cabe ni ayuda. */
const INTENT_COUNT = 3;

export type ReplyIntent = { id: string; label: string; hint: string };

export type ReplyIntentsCache = {
  intents: ReplyIntent[];
  lastMessageId: string;
  generatedAt: string;
};

export type ReplyIntentsResult =
  | { ok: true; intents: ReplyIntent[]; cached: boolean }
  | { ok: false; status: number; error: string };

function isIntent(value: unknown): value is ReplyIntent {
  if (!value || typeof value !== "object") return false;
  const v = value as Partial<ReplyIntent>;
  return typeof v.label === "string" && v.label.trim().length > 0;
}

export function parseReplyIntentsCache(raw: unknown): ReplyIntentsCache | null {
  if (!raw || typeof raw !== "object" || Array.isArray(raw)) return null;
  const cache = raw as Partial<ReplyIntentsCache>;
  if (typeof cache.lastMessageId !== "string" || !Array.isArray(cache.intents)) return null;
  const intents = cache.intents.filter(isIntent);
  if (intents.length !== INTENT_COUNT) return null;
  return {
    intents,
    lastMessageId: cache.lastMessageId,
    generatedAt: typeof cache.generatedAt === "string" ? cache.generatedAt : "",
  };
}

/** Recorta a n palabras (los chips no pueden crecer con la respuesta del modelo). */
function clampWords(text: string, max: number): string {
  const words = text.replace(/\s+/g, " ").trim().split(" ").filter(Boolean);
  return words.slice(0, max).join(" ");
}

/**
 * Parseo tolerante de la respuesta del modelo: acepta fences ```json,
 * texto alrededor y objetos `{ intents: [...] }`. Devuelve [] si no hay
 * exactamente 3 intenciones válidas (el chip muestra error reintentable).
 */
export function parseReplyIntentsResponse(raw: string): ReplyIntent[] {
  if (!raw?.trim()) return [];
  const cleaned = raw.replace(/```(?:json)?/gi, "").trim();
  const start = cleaned.indexOf("[");
  const end = cleaned.lastIndexOf("]");
  if (start === -1 || end === -1 || end < start) return [];
  let parsed: unknown;
  try {
    parsed = JSON.parse(cleaned.slice(start, end + 1));
  } catch {
    return [];
  }
  if (!Array.isArray(parsed)) return [];
  const intents = parsed
    .filter(isIntent)
    .map((item, index) => ({
      id: `intent-${index + 1}`,
      label: clampWords(item.label, 5),
      hint: clampWords(typeof item.hint === "string" ? item.hint : "", 8),
    }))
    .filter((item) => item.label.length > 0);
  return intents.length >= INTENT_COUNT ? intents.slice(0, INTENT_COUNT) : [];
}

export async function generateReplyIntents(params: {
  tenantId: string;
  emailAccountId: string;
  threadId: string;
}): Promise<ReplyIntentsResult> {
  const { tenantId, threadId } = params;
  const thread = await prisma.crmEmailThread.findFirst({
    where: { id: threadId, tenantId, emailAccountId: params.emailAccountId },
    select: { id: true, subject: true, aiReplyIntents: true },
  });
  if (!thread) return { ok: false, status: 404, error: "Hilo no encontrado" };

  const messages = await prisma.crmEmailMessage.findMany({
    where: { threadId: thread.id, tenantId, isDraft: false },
    orderBy: { sentAt: "asc" },
    select: {
      id: true,
      direction: true,
      fromEmail: true,
      sentAt: true,
      textBody: true,
      htmlBody: true,
    },
  });
  if (messages.length === 0) {
    return { ok: false, status: 400, error: "El hilo no tiene mensajes" };
  }
  const lastMessageId = messages[messages.length - 1].id;

  const cache = parseReplyIntentsCache(thread.aiReplyIntents);
  if (cache && cache.lastMessageId === lastMessageId) {
    return { ok: true, intents: cache.intents, cached: true };
  }

  const prompt = `Sos el asistente de correo de una empresa de seguridad privada en Chile. Proponé ${INTENT_COUNT} MANERAS DISTINTAS de responder este hilo (no redactes la respuesta).
Devolvé SOLO un array JSON, sin texto alrededor, con este formato exacto:
[{"label":"Confirmar reunión","hint":"proponer horario esta semana"}]
Reglas: exactamente ${INTENT_COUNT} objetos; "label" en imperativo, máximo 5 palabras; "hint" máximo 8 palabras explicando el ángulo; español chileno neutro; opciones claramente distintas entre sí; nada de precios ni datos inventados.
Asunto: ${thread.subject}
${UNTRUSTED_RULES}
${wrapUntrusted(buildTranscript(messages))}`;

  const startedAt = Date.now();
  let raw: string;
  try {
    raw = await aiService.generateText(
      prompt,
      { maxTokens: 300, temperature: 0.5 },
      { tenantId, feature: INTENTS_FEATURE },
    );
  } catch {
    return { ok: false, status: 502, error: "La IA no pudo sugerir respuestas" };
  }

  const intents = parseReplyIntentsResponse(raw ?? "");

  // Proveedor/modelo EFECTIVOS del tenant. Sin config activa no se registra
  // nada: inventar un providerType ensucia la telemetría de costos.
  const cfg = await aiService.getActiveConfig?.({ tenantId, feature: INTENTS_FEATURE });
  if (cfg) {
    logAiUsage({
      tenantId,
      providerType: cfg.providerType,
      model: cfg.modelId ?? "default",
      feature: INTENTS_FEATURE,
      inputTokens: Math.ceil(prompt.length / 4),
      outputTokens: Math.ceil((raw ?? "").length / 4),
      durationMs: Date.now() - startedAt,
      metadata: {
        promptVersion: INTENTS_PROMPT_VERSION,
        estimated: true,
        threadId,
        parsed: intents.length,
      },
    });
  }

  if (intents.length !== INTENT_COUNT) {
    return { ok: false, status: 502, error: "La IA no devolvió sugerencias válidas" };
  }

  await prisma.crmEmailThread.update({
    where: { id: thread.id },
    data: {
      aiReplyIntents: {
        intents,
        lastMessageId,
        generatedAt: new Date().toISOString(),
      },
    },
  });

  return { ok: true, intents, cached: false };
}
