import { aiService } from "@/lib/ai-service";
import type { RadarClassification, RadarCompromiso } from "./radar-types";
import type { LeadFeedback } from "./radar-feedback";
import { clampText } from "./radar-util";

const CATEGORIAS = ["cotizacion", "licitacion", "consulta_comercial", "facturacion", "operacional", "otro"];
const INTENCIONES = ["alta", "media", "baja"];

function asStr(v: unknown): string {
  return typeof v === "string" ? v.trim() : "";
}

function normalizeCompromisos(v: unknown): RadarCompromiso[] {
  if (!Array.isArray(v)) return [];
  return v
    .map((c) => {
      const o = (c || {}) as Record<string, unknown>;
      const quien = asStr(o.quien) === "nosotros" ? "nosotros" : "cliente";
      const que = clampText(asStr(o.que), 160);
      const fechaISO = asStr(o.fechaISO);
      return { quien, que, fechaISO } as RadarCompromiso;
    })
    .filter(
      (c) =>
        c.que &&
        /^\d{4}-\d{2}-\d{2}$/.test(c.fechaISO) &&
        !Number.isNaN(new Date(`${c.fechaISO}T12:00:00.000Z`).getTime()),
    );
}

function normalize(raw: Record<string, unknown>): RadarClassification {
  const categoria = CATEGORIAS.includes(asStr(raw.categoria)) ? asStr(raw.categoria) : "otro";
  const intencion = INTENCIONES.includes(asStr(raw.intencion)) ? asStr(raw.intencion) : "baja";
  const senales = Array.isArray(raw.senalesCompra)
    ? raw.senalesCompra.map((s) => clampText(asStr(s), 120)).filter(Boolean).slice(0, 6)
    : [];
  return {
    categoria: categoria as RadarClassification["categoria"],
    intencion: intencion as RadarClassification["intencion"],
    resumen: clampText(asStr(raw.resumen), 140),
    requiereRespuesta: raw.requiereRespuesta !== false,
    senalesCompra: senales,
    compromisos: normalizeCompromisos(raw.compromisos),
  };
}

/**
 * Bloque de calibración few-shot desde las decisiones ✓/✗ del usuario:
 * aprende qué considera lead real y qué descarta. Vacío si no hay historial.
 */
function feedbackBlock(examples?: LeadFeedback): string {
  const approved = examples?.approved ?? [];
  const rejected = examples?.rejected ?? [];
  if (approved.length === 0 && rejected.length === 0) return "";
  const lines = ["", "Calibración según decisiones previas de este usuario (contexto, no reglas absolutas):"];
  if (approved.length) lines.push(`- Los consideró LEADS REALES: ${approved.map((s) => `"${s}"`).join("; ")}`);
  if (rejected.length) lines.push(`- Los DESCARTÓ (no eran leads): ${rejected.map((s) => `"${s}"`).join("; ")}`);
  lines.push('Usa este patrón para calibrar "intencion" y si el correo es un lead comercial.');
  return lines.join("\n");
}

/** Clasifica un correo entrante externo con `gpt-4o-mini` (JSON estricto). */
export async function classifyThread(input: {
  tenantId: string;
  subject: string;
  fromEmail: string;
  body: string;
  hoyISO: string;
  examples?: LeadFeedback;
}): Promise<RadarClassification | null> {
  const prompt = `Eres un clasificador comercial de una empresa de seguridad privada en Chile. Clasifica el correo ENTRANTE de abajo. Responde SOLO un JSON válido con esta forma exacta:
{"categoria":"cotizacion|licitacion|consulta_comercial|facturacion|operacional|otro","intencion":"alta|media|baja","resumen":"1 línea en español","requiereRespuesta":true,"senalesCompra":["pide plazos"],"compromisos":[{"quien":"cliente|nosotros","que":"...","fechaISO":"YYYY-MM-DD"}]}
Reglas:
- intencion "alta" solo si hay interés comercial claro (pide cotización, precios, plazos, reunión).
- senalesCompra: frases breves que reflejen intención de compra; [] si no hay.
- compromisos: promesas con fecha de cualquiera de las partes ("te confirmamos el jueves"); fechaISO absoluta (hoy es ${input.hoyISO}); [] si no hay.
- resumen: máx 140 caracteres, sin saludos.${feedbackBlock(input.examples)}
Asunto: ${clampText(input.subject, 200)}
Remitente: ${input.fromEmail}
Cuerpo:
${clampText(input.body, 3000)}`;
  try {
    const raw = (await aiService.generateJSONWithModel(prompt, "gpt-4o-mini", 500, {
      tenantId: input.tenantId,
    })) as Record<string, unknown>;
    return normalize(raw || {});
  } catch {
    return null; // degradación elegante: se reintenta en la próxima corrida
  }
}

/** Sugiere el próximo paso comercial como título de tarea (imperativo, breve). */
export async function suggestNextStepTask(input: {
  tenantId: string;
  subject: string;
  fromEmail: string;
  body: string;
}): Promise<string | null> {
  const prompt = `Del correo entrante de un prospecto de seguridad privada, dame el PRÓXIMO PASO comercial como título de tarea: en imperativo, breve (máx 8 palabras), sin fecha ni saludos. Ejemplos: "Enviar propuesta firmada", "Agendar reunión de kickoff", "Llamar para confirmar dotación". Devuelve SOLO el título.
De ${input.fromEmail} (${clampText(input.subject, 160)}):
${clampText(input.body, 1500)}`;
  try {
    const txt = await aiService.generateText(prompt, { maxTokens: 40, temperature: 0.3 }, {
      tenantId: input.tenantId,
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
}): Promise<string | null> {
  const extra = input.instructions?.trim()
    ? `\nIndicaciones del usuario (tienen prioridad sobre la estructura anterior): ${clampText(input.instructions.trim(), 500)}`
    : "";
  const prompt = `Redacta un BORRADOR de respuesta breve y profesional en español chileno neutro a este correo entrante de un prospecto de seguridad privada. NO inventes precios ni datos. Estructura: (1) acusar recibo, (2) 1-2 preguntas clave para avanzar, (3) próximo paso claro. Máx 90 palabras. Devuelve SOLO el texto del correo, sin asunto ni firma.${extra}
Resumen: ${input.resumen}
Correo de ${input.fromEmail} (${clampText(input.subject, 160)}):
${clampText(input.body, 2000)}`;
  try {
    const txt = await aiService.generateText(prompt, { maxTokens: 300, temperature: 0.4 }, {
      tenantId: input.tenantId,
    });
    return txt?.trim() || null;
  } catch {
    return null;
  }
}
