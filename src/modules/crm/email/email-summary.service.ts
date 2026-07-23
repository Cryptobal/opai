/**
 * Resúmenes reales de hilo (A01/A02, Prompt D etapa 2):
 *  - `full`: resumen del hilo COMPLETO on-demand, cacheado por el último
 *    mensaje (reabrir sin cambios NO re-llama al modelo).
 *  - `since-read`: "qué pasó desde tu última lectura" usando el read-state
 *    (last_read_at se sella al marcar leído).
 * Contenido externo delimitado como no confiable (A13) y costo loggeado
 * (feature correo-thread-summary).
 */
import { prisma } from "@/lib/prisma";
import { aiService } from "@/lib/ai-service";
import { logAiUsage } from "@/lib/platform-ai-service";
import { UNTRUSTED_RULES, wrapUntrusted } from "./ai-untrusted";

const SUMMARY_PROMPT_VERSION = "thread-summary-v1";
const MAX_TRANSCRIPT_CHARS = 9_000;

export type ThreadSummaryResult =
  | {
      ok: true;
      summary: string;
      cached: boolean;
      mode: "full" | "since-read";
      messagesCovered: number;
    }
  | { ok: false; status: number; error: string };

type SummaryCache = { summary: string; lastMessageId: string; generatedAt: string };

function parseCache(raw: unknown): SummaryCache | null {
  if (!raw || typeof raw !== "object" || Array.isArray(raw)) return null;
  const cache = raw as Partial<SummaryCache>;
  return typeof cache.summary === "string" && typeof cache.lastMessageId === "string"
    ? (cache as SummaryCache)
    : null;
}

function messageText(m: { textBody: string | null; htmlBody: string | null }): string {
  return (
    m.textBody?.trim() ||
    m.htmlBody?.replace(/<[^>]+>/g, " ").replace(/&nbsp;/gi, " ") ||
    ""
  )
    .replace(/\s+/g, " ")
    .trim();
}

function buildTranscript(
  messages: Array<{
    fromEmail: string;
    direction: string;
    sentAt: Date | null;
    textBody: string | null;
    htmlBody: string | null;
  }>,
): string {
  const parts: string[] = [];
  let used = 0;
  // Los últimos mensajes son los más relevantes: recorrer desde el final.
  for (const m of [...messages].reverse()) {
    const text = messageText(m).slice(0, 2_000);
    if (!text) continue;
    const line = `[${m.sentAt?.toISOString().slice(0, 16) ?? "?"}] ${m.direction === "out" ? "NOSOTROS" : m.fromEmail}: ${text}`;
    if (used + line.length > MAX_TRANSCRIPT_CHARS) break;
    parts.unshift(line);
    used += line.length;
  }
  return parts.join("\n---\n");
}

export async function summarizeThread(params: {
  tenantId: string;
  emailAccountId: string;
  threadId: string;
  mode: "full" | "since-read";
}): Promise<ThreadSummaryResult> {
  const { tenantId, threadId, mode } = params;
  const thread = await prisma.crmEmailThread.findFirst({
    where: { id: threadId, tenantId, emailAccountId: params.emailAccountId },
    select: { id: true, subject: true, aiThreadSummary: true, lastReadAt: true },
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

  let scoped = messages;
  if (mode === "since-read") {
    scoped = thread.lastReadAt
      ? messages.filter((m) => m.sentAt && m.sentAt > thread.lastReadAt!)
      : messages.slice(-3);
    if (scoped.length === 0) {
      return {
        ok: true,
        summary: "No hay mensajes nuevos desde tu última lectura.",
        cached: true,
        mode,
        messagesCovered: 0,
      };
    }
  } else {
    // Caché por último mensaje: reabrir sin cambios no re-llama al modelo.
    const cache = parseCache(thread.aiThreadSummary);
    if (cache && cache.lastMessageId === lastMessageId) {
      return {
        ok: true,
        summary: cache.summary,
        cached: true,
        mode,
        messagesCovered: messages.length,
      };
    }
  }

  const instruction =
    mode === "full"
      ? `Resume este hilo de correo COMPLETO para un ejecutivo de una empresa de seguridad privada chilena, en español: (1) de qué se trata, (2) estado actual y qué respondió cada parte, (3) compromisos/fechas pendientes, (4) próximo paso sugerido. Máximo 120 palabras, en viñetas breves.`
      : `Resume SOLO lo nuevo de este hilo desde la última lectura del usuario, en español: qué pasó, quién respondió qué, y si hay algo que requiera acción. Máximo 80 palabras, en viñetas breves.`;
  const prompt = `${instruction}\nAsunto: ${thread.subject}\n${UNTRUSTED_RULES}\n${wrapUntrusted(buildTranscript(scoped))}`;

  const startedAt = Date.now();
  let summary: string;
  try {
    summary = (
      await aiService.generateText(prompt, { maxTokens: 350, temperature: 0.3 }, { tenantId, feature: "correo-thread-summary" })
    ).trim();
  } catch {
    return { ok: false, status: 502, error: "La IA no pudo resumir el hilo" };
  }
  logAiUsage({
    tenantId,
    providerType: "openai",
    model: "default",
    feature: mode === "full" ? "correo-thread-summary" : "correo-summary-since-read",
    inputTokens: Math.ceil(prompt.length / 4),
    outputTokens: Math.ceil(summary.length / 4),
    durationMs: Date.now() - startedAt,
    metadata: { promptVersion: SUMMARY_PROMPT_VERSION, estimated: true, threadId },
  });

  if (mode === "full") {
    await prisma.crmEmailThread.update({
      where: { id: thread.id },
      data: {
        aiThreadSummary: {
          summary,
          lastMessageId,
          generatedAt: new Date().toISOString(),
        },
      },
    });
  }
  return { ok: true, summary, cached: false, mode, messagesCovered: scoped.length };
}
