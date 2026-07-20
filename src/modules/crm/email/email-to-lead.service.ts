import { prisma } from "@/lib/prisma";
import { aiService } from "@/lib/ai-service";
import { gmailClientForAccount } from "./gmail-account-client";
import { prepareThreadAttachments, type PreparedAttachments } from "./email-to-lead-attachments";
import type { LeadExtraction, LeadExtractionResult } from "./email-to-lead.types";

const SYSTEM = `Eres un asistente que extrae datos de un correo comercial dirigido a una empresa de seguridad privada en Chile, para crear un LEAD. El correo puede venir reenviado; el cliente real está en el cuerpo. Ignora los datos de la empresa receptora o del empleado que reenvía.

Devuelve SOLO un objeto JSON con EXACTAMENTE estas claves (usa null si no hay dato):
{
  "empresa": string|null,
  "rut": string|null,
  "contacto": { "nombre": string|null, "cargo": string|null, "email": string|null, "telefono": string|null },
  "requerimiento": string|null,
  "dotacionEstimada": number|null,
  "instalacionComuna": string|null,
  "fechaLimite": string|null,
  "esLicitacion": boolean,
  "confianza": { "empresa": number, "contacto": number, "requerimiento": number, "fechaLimite": number }
}
"fechaLimite" en formato YYYY-MM-DD. "esLicitacion" true si es licitación/bases/concurso. "confianza" de 0 a 1 por campo.`;

function str(v: unknown): string | null {
  return typeof v === "string" && v.trim() ? v.trim() : null;
}
function num(v: unknown): number | null {
  const n = Number(v);
  return Number.isFinite(n) && n > 0 ? Math.round(n) : null;
}

function normalize(raw: Record<string, unknown>): LeadExtraction {
  const c = (raw.contacto ?? {}) as Record<string, unknown>;
  const confianza: Record<string, number> = {};
  for (const [k, v] of Object.entries((raw.confianza ?? {}) as Record<string, unknown>)) {
    const n = Number(v);
    if (Number.isFinite(n)) confianza[k] = Math.max(0, Math.min(1, n));
  }
  return {
    empresa: str(raw.empresa),
    rut: str(raw.rut),
    contacto: { nombre: str(c.nombre), cargo: str(c.cargo), email: str(c.email), telefono: str(c.telefono) },
    requerimiento: str(raw.requerimiento),
    dotacionEstimada: num(raw.dotacionEstimada),
    instalacionComuna: str(raw.instalacionComuna),
    fechaLimite: str(raw.fechaLimite),
    esLicitacion: Boolean(raw.esLicitacion),
    confianza,
  };
}

/** Extrae una propuesta de lead del hilo (texto + adjuntos). NO crea nada. */
export async function extractLeadFromThread(params: {
  tenantId: string;
  emailAccountId: string;
  threadId: string;
}): Promise<LeadExtractionResult | null> {
  const { tenantId, emailAccountId, threadId } = params;
  const thread = await prisma.crmEmailThread.findFirst({
    where: { id: threadId, tenantId, emailAccountId },
    select: { id: true, subject: true, providerThreadId: true },
  });
  if (!thread) return null;

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
    .slice(0, 8000);

  let att: PreparedAttachments = { stagedFiles: [], docText: "", images: [], imageMimes: [], sources: [] };
  const gmail = account ? gmailClientForAccount(account) : null;
  if (gmail && thread.providerThreadId) {
    att = await prepareThreadAttachments(gmail, thread.providerThreadId, tenantId).catch(() => att);
  }

  const prompt = `${SYSTEM}\n\n--- ASUNTO ---\n${thread.subject}\n\n--- CORREO ---\n${bodyText}${att.docText ? `\n\n--- ADJUNTOS (texto) ---${att.docText}` : ""}`;

  let raw: Record<string, unknown>;
  try {
    raw = (att.images.length
      ? await aiService.generateFromImages(att.images, att.imageMimes, prompt, { maxTokens: 1500 }, { tenantId })
      : await aiService.generateJSON(prompt, 1500, { tenantId })) as Record<string, unknown>;
  } catch (err) {
    console.error("[email-to-lead] IA falló:", err);
    throw new Error("La IA no pudo procesar el correo. Intentá de nuevo.");
  }

  return { proposal: normalize(raw), stagedFiles: att.stagedFiles, sources: att.sources };
}
