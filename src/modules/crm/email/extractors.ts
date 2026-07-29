import { prisma } from "@/lib/prisma";
import { aiService } from "@/lib/ai-service";
import { logAiUsage } from "@/lib/platform-ai-service";
import { UNTRUSTED_RULES, wrapUntrusted } from "./ai-untrusted";
import { gmailClientForAccount } from "./gmail-account-client";
import { prepareThreadAttachments, type PreparedAttachments } from "./email-to-lead-attachments";
import type { RadarCapability } from "./radar-types";

/**
 * Extractores profundos BAJO DEMANDA por vertical (F3). Se disparan sólo por
 * clic del usuario (nunca en el cron de sync). Devuelven una PROPUESTA JSON; no
 * crean nada — el usuario confirma después. Reutilizan UNTRUSTED_RULES +
 * prepareThreadAttachments (cuerpo y adjuntos son entrada no confiable).
 */
export type ExtractorVertical = "operativo" | "rrhh" | "cobranza";

export interface ExtractorConfig {
  feature: string;
  capability: RadarCapability;
  system: string;
}

const OPERATIVO_SYSTEM = `Eres un asistente que lee un hilo de correo dirigido a una empresa de seguridad privada en Chile y prepara el BORRADOR de un TICKET operativo (reclamo o solicitud). No inventes datos.
Devuelve SOLO un objeto JSON con EXACTAMENTE estas claves (null si no hay dato):
{
  "tipo": "reclamo"|"solicitud",
  "titulo": string,            // breve, imperativo
  "descripcion": string,       // qué pide o reclama el cliente, con detalle útil
  "prioridad": "alta"|"media"|"baja",
  "instalacion": string|null,  // nombre o dirección de la instalación si se menciona
  "cliente": string|null
}`;

const RRHH_SYSTEM = `Eres un asistente que lee un hilo de correo dirigido a una empresa de seguridad privada en Chile y prepara el BORRADOR de un POSTULANTE para el ATS a partir de una postulación o CV. No inventes datos.
Devuelve SOLO un objeto JSON con EXACTAMENTE estas claves (null si no hay dato):
{
  "nombre": string|null,
  "rut": string|null,
  "telefono": string|null,
  "email": string|null,
  "cargo": string|null,        // cargo al que postula
  "experiencia": string|null,  // resumen de experiencia relevante
  "resumen": string            // resumen breve del postulante
}`;

const COBRANZA_SYSTEM = `Eres un asistente que lee un hilo de correo dirigido a una empresa de seguridad privada en Chile relacionado con finanzas/cobranza y prepara un CONTEXTO DE COBRANZA. No inventes montos ni folios.
Devuelve SOLO un objeto JSON con EXACTAMENTE estas claves (null si no hay dato):
{
  "folio": string|null,        // número de factura/DTE si aparece
  "monto": string|null,        // monto mencionado, tal cual
  "cliente": string|null,
  "estado": string|null,       // p.ej. "pago comprometido", "en disputa"
  "contexto": string,          // qué dice el cliente sobre el pago
  "accion_sugerida": string    // próximo paso de cobranza sugerido, breve
}`;

export const EXTRACTORS: Record<ExtractorVertical, ExtractorConfig> = {
  operativo: { feature: "correo-extract-operativo", capability: "radar_operaciones", system: OPERATIVO_SYSTEM },
  rrhh: { feature: "correo-extract-rrhh", capability: "radar_rrhh", system: RRHH_SYSTEM },
  cobranza: { feature: "correo-extract-cobranza", capability: "radar_finanzas", system: COBRANZA_SYSTEM },
};

export interface ExtractorResult {
  ok: boolean;
  proposal?: Record<string, unknown>;
  error?: string;
}

/** Corre un extractor sobre un hilo. NO crea nada; devuelve la propuesta. */
export async function runThreadExtractor(params: {
  tenantId: string;
  emailAccountId: string;
  threadId: string;
  vertical: ExtractorVertical;
}): Promise<ExtractorResult> {
  const { tenantId, emailAccountId, threadId } = params;
  const cfg = EXTRACTORS[params.vertical];

  const thread = await prisma.crmEmailThread.findFirst({
    where: { id: threadId, tenantId, emailAccountId },
    select: { id: true, subject: true, providerThreadId: true },
  });
  if (!thread) return { ok: false, error: "Hilo no encontrado" };

  const [messages, account] = await Promise.all([
    prisma.crmEmailMessage.findMany({
      where: { threadId: thread.id, tenantId },
      orderBy: { sentAt: "asc" },
      select: { fromEmail: true, textBody: true, htmlBody: true },
    }),
    prisma.crmEmailAccount.findUnique({
      where: { id: emailAccountId },
      select: { accessTokenEncrypted: true, refreshTokenEncrypted: true },
    }),
  ]);

  const bodyText = messages
    .map((m) => `De: ${m.fromEmail}\n${(m.textBody || m.htmlBody?.replace(/<[^>]+>/g, " ") || "").trim()}`)
    .join("\n\n---\n\n")
    .slice(0, 12000);

  // El extractor funciona sólo con texto si no hay adjuntos.
  let att: PreparedAttachments = {
    stagedFiles: [],
    docText: "",
    images: [],
    imageMimes: [],
    sources: [],
    pdfsForVision: [],
  };
  const gmail = account ? gmailClientForAccount(account) : null;
  if (gmail && thread.providerThreadId) {
    att = await prepareThreadAttachments(gmail, thread.providerThreadId, tenantId).catch(() => att);
  }

  const prompt = `${cfg.system}\n\n${UNTRUSTED_RULES}\n${wrapUntrusted(
    `--- ASUNTO ---\n${thread.subject}\n\n--- CORREO ---\n${bodyText}${att.docText ? `\n\n--- ADJUNTOS (texto) ---${att.docText}` : ""}`,
  )}`;

  const startedAt = Date.now();
  try {
    const raw = (att.images.length
      ? await aiService.generateFromImages(att.images, att.imageMimes, prompt, { maxTokens: 1500 }, { tenantId, feature: cfg.feature })
      : await aiService.generateJSON(prompt, 1500, { tenantId, feature: cfg.feature })) as Record<string, unknown>;
    const active = await aiService.getActiveConfig?.({ tenantId, feature: cfg.feature });
    logAiUsage({
      tenantId,
      providerType: active?.providerType ?? "openai",
      model: active?.modelId ?? (att.images.length ? "vision-default" : "json-default"),
      feature: cfg.feature,
      inputTokens: Math.ceil(prompt.length / 4),
      outputTokens: Math.ceil(JSON.stringify(raw ?? {}).length / 4),
      durationMs: Date.now() - startedAt,
      metadata: { estimated: true, onDemand: true, vertical: params.vertical },
    });
    return { ok: true, proposal: raw };
  } catch (err) {
    console.error(`[extractor:${cfg.feature}] IA falló:`, err);
    return { ok: false, error: "La IA no pudo procesar el correo. Intentá de nuevo." };
  }
}
