/**
 * Extracción estructurada de datos de lead desde el contenido de un email
 * (solicitudes de servicio de seguridad en Chile).
 *
 * Usa AIService (proveedores configurados en Configuración > IA) en lugar de
 * OPENAI_API_KEY del entorno, para respetar las API keys que el tenant configura.
 */

import { aiService } from "@/lib/ai-service";

export type ExtractedLeadData = {
  companyName: string | null;
  rut: string | null;
  legalName: string | null;
  businessActivity: string | null;
  legalRepresentativeName: string | null;
  contactFirstName: string | null;
  contactLastName: string | null;
  contactEmail: string | null;
  contactPhone: string | null;
  contactRole: string | null;
  address: string | null;
  city: string | null;
  commune: string | null;
  serviceType: string | null;
  serviceDuration: string | null;
  coverageDetails: string | null;
  guardsPerShift: string | null;
  numberOfLocations: string | null;
  startDate: string | null;
  summary: string | null;
  industry: string | null;
  website: string | null;
};

function buildSystemPrompt(companyName: string, domain: string): string {
  return `Eres un asistente que extrae datos estructurados de correos electrónicos dirigidos a una empresa de seguridad privada en Chile (${companyName}).

CONTEXTO CRÍTICO:
- ${companyName} (${domain}) es la empresa que RECIBE estas solicitudes. NUNCA extraigas "${companyName}" ni datos de empleados de ${domain} como la empresa o contacto solicitante.
- Estos correos suelen ser REENVIADOS por un empleado de ${companyName} (ej. usuario@${domain}) a un buzón interno. El cliente real que solicita el servicio está en el CUERPO del correo (dentro del mensaje reenviado).
- Busca patrones de reenvío como "---------- Forwarded message ----------", "De:", "From:", "Mensaje reenviado", "Original Message", "Mensaje original", firmas con logos de otras empresas, etc.
- Si ves datos de ${companyName} / ${domain} (nombre, dirección, teléfono, firma), IGNÓRALOS completamente; son del empleado que reenvía, no del cliente.

El correo suele contener solicitudes de servicio de seguridad (guardias, vigilancia, resguardo de obras/instalaciones). Puede incluir datos de la empresa solicitante, del contacto, datos legales/facturación, y requerimientos del servicio.

Extrae TODO lo que encuentres DEL CLIENTE SOLICITANTE (no de ${companyName}). Si un dato no aparece en el texto, usa una cadena vacía "" para ese campo.

Campos a extraer:
- companyName: nombre comercial de la empresa SOLICITANTE (la que pide el servicio, NUNCA "${companyName}")
- rut: RUT de la empresa solicitante (formato chileno, ej. 77.985.438-8)
- legalName: razón social de la empresa solicitante
- businessActivity: giro o actividad comercial de la empresa solicitante
- legalRepresentativeName: nombre del representante legal de la empresa solicitante
- contactFirstName/contactLastName: nombre de la persona que SOLICITA el servicio (no del empleado de ${companyName} que reenvía)
- contactEmail: email del contacto solicitante (NO usar emails @${domain})
- contactPhone: teléfono del contacto solicitante (NO usar teléfonos de empleados ${companyName})
- contactRole: cargo del contacto solicitante
- address: dirección de la instalación o sede donde se requiere el servicio
- city: ciudad
- commune: comuna (contexto Chile)
- serviceType: tipo de servicio (ej. "Guardias de seguridad 24/7", "Resguardo de obra", "Control de acceso")
- serviceDuration: duración estimada (ej. "6 meses", "indefinido")
- coverageDetails: detalles de cobertura (turnos, horarios, 24x7, fines de semana, festivos)
- guardsPerShift: cantidad de guardias por turno o total solicitados
- numberOfLocations: cantidad de puntos/instalaciones/sedes a cubrir
- startDate: fecha estimada de inicio (ej. "02 de marzo", "inmediato", "a definir")
- summary: resumen ejecutivo del NEGOCIO en 2-5 oraciones: qué pide el cliente, tipo de servicio, alcance, plazos. Si hay más mensajes en la conversación, puedes usar ese contexto para enriquecer el resumen.
- industry: rubro del cliente solicitante (construcción, minería, retail, inmobiliaria, energía, etc.)
- website: sitio web de la empresa solicitante. Buscar URLs en la firma del contacto, cuerpo del correo o datos de la empresa (ej. www.empresa.cl, https://empresa.cl). NO usar sitios de ${companyName} (${domain}). Si encuentras una URL sin protocolo (ej. "www.empresa.cl"), devuélvela con https:// (ej. "https://www.empresa.cl")

Cuando el texto incluye "MENSAJE ORIGINAL" y "CONTEXTO DE LA CONVERSACIÓN": extrae contacto, empresa y datos estructurados SOLO del mensaje original (primer reenvío). El resumen (summary) puede incorporar también lo relevante del contexto de la conversación.

Responde ÚNICAMENTE con un objeto JSON válido. Todos estos campos son obligatorios (usa "" si no hay dato): companyName, rut, legalName, businessActivity, legalRepresentativeName, contactFirstName, contactLastName, contactEmail, contactPhone, contactRole, address, city, commune, serviceType, serviceDuration, coverageDetails, guardsPerShift, numberOfLocations, startDate, summary, industry, website.`;
}

/**
 * Convierte HTML de email a texto plano preservando la estructura visible.
 * Más robusto que un strip simple: preserva saltos de línea, listas, y separadores.
 */
function stripHtml(html: string): string {
  return html
    .replace(/<script\b[^<]*(?:(?!<\/script>)<[^<]*)*<\/script>/gi, "")
    .replace(/<style\b[^<]*(?:(?!<\/style>)<[^<]*)*<\/style>/gi, "")
    .replace(/<br\s*\/?>/gi, "\n")
    .replace(/<\/p>/gi, "\n\n")
    .replace(/<\/div>/gi, "\n")
    .replace(/<\/tr>/gi, "\n")
    .replace(/<\/li>/gi, "\n")
    .replace(/<li[^>]*>/gi, "- ")
    .replace(/<hr[^>]*>/gi, "\n---\n")
    .replace(/<\/h[1-6]>/gi, "\n\n")
    .replace(/<[^>]+>/g, " ")
    .replace(/&nbsp;/g, " ")
    .replace(/&amp;/g, "&")
    .replace(/&lt;/g, "<")
    .replace(/&gt;/g, ">")
    .replace(/&quot;/g, '"')
    .replace(/&#39;/g, "'")
    .replace(/&apos;/g, "'")
    .replace(/[ \t]+/g, " ")
    .replace(/ *\n */g, "\n")
    .replace(/\n{3,}/g, "\n\n")
    .trim();
}

/**
 * Patrones de reenvío soportados:
 * - Gmail: "---------- Forwarded message ----------"
 * - Gmail ES: "---------- Mensaje reenviado ----------"
 * - Outlook: "-----Original Message-----" o "-----Mensaje original-----"
 * - Apple Mail / genérico: "Begin forwarded message:" o "Inicio del mensaje reenviado:"
 * - Outlook header block: "De: ... Enviado: ... Para: ... Asunto: ..."
 */
const FORWARD_PATTERNS: RegExp[] = [
  /----------\s*(?:Forwarded\s+message|Mensaje\s+reenviado)\s*----------/i,
  /-----\s*(?:Original\s+Message|Mensaje\s+original)\s*-----/i,
  /(?:Begin\s+forwarded\s+message|Inicio\s+del\s+mensaje\s+reenviado)\s*:/i,
  /(?:^|\n)\s*(?:De|From)\s*:\s*.+\n\s*(?:Enviado|Sent|Fecha|Date)\s*:\s*.+\n\s*(?:Para|To)\s*:\s*.+\n\s*(?:Asunto|Subject)\s*:\s*.+/im,
];

const NEXT_BLOCK_REGEX = /\n\s*(?:----------\s*.+|-----\s*(?:Original\s+Message|Mensaje\s+original)\s*-----)/i;

/**
 * Patrones de respuesta citada (reply, no forward):
 * - Gmail: "On Wed, Mar 12, 2025 at 1:06 PM X <x@y.com> wrote:"
 * - Gmail ES: "El 12 mar 2025 13:06, X <x@y.com> escribió:"
 * - Outlook: "-----Original Message-----" (ya cubierto en FORWARD)
 */
const REPLY_QUOTE_PATTERNS: RegExp[] = [
  /On\s+.+?wrote:/i,
  /El\s+.+?escribió:/i,
  /Le\s+.+?écrivit:/i,
  /Il\s+.+?ha\s+scritto:/i,
  /Em\s+.+?escreveu:/i,
];

const MAX_CONTEXT_CHARS = 2500;

/**
 * Detecta si el cuerpo del email contiene marcadores de reenvío,
 * sin depender del dominio del remitente.
 */
export function detectForwardInBody(body: string): boolean {
  return FORWARD_PATTERNS.some((pattern) => pattern.test(body));
}

/**
 * Extrae el bloque citado en una respuesta (reply) cuando no hay marcador de forward.
 * Ej: "Cordialmente, Carlos...\n\nOn Wed, X wrote:\n> texto original"
 * → devuelve "texto original" (sin los ">" si los hay).
 */
function extractQuotedReplyBlock(body: string): string | null {
  const trimmed = body.trim();
  if (!trimmed) return null;

  for (const pattern of REPLY_QUOTE_PATTERNS) {
    const m = trimmed.match(pattern);
    if (m && m.index !== undefined) {
      const start = m.index + m[0].length;
      const quoted = trimmed.slice(start).replace(/^\s*\n?/, "");
      // Quitar prefijos ">" de líneas citadas
      const cleaned = quoted
        .split("\n")
        .map((line) => line.replace(/^>\s?/, ""))
        .join("\n")
        .trim();
      if (cleaned.length > 30) return cleaned;
    }
  }
  return null;
}

/**
 * Patrones que indican correo basura (autocompletado, 1Password, accesibilidad, etc.).
 * Estos correos no deben crear leads.
 */
const GARBAGE_PATTERNS: RegExp[] = [
  /1Password/i,
  /Pulsa el tabulador/i,
  /Pulsa la fecha/i,
  /menú de 1Password/i,
  /Insertar.*tabulador/i,
  /hacia abajo para seleccionar/i,
  /Press (?:the )?tab to insert/i,
  /Press (?:the )?(?:down )?arrow to select/i,
  /autocomplete|autocompletar/i,
  /sugerencia de .* disponible/i,
];

const MIN_VALID_BODY_LENGTH = 50;

/**
 * Detecta si el contenido del email es basura (autocompletado, 1Password, etc.)
 * y no debe crear un lead.
 */
export function isGarbageEmail(params: {
  textBody?: string | null;
  htmlBody?: string | null;
  subject?: string | null;
}): boolean {
  const text = (params.textBody?.trim() || "").trim() || stripHtml(params.htmlBody || "").trim();
  if (!text) return true;

  // Contiene patrones de basura (1Password, accesibilidad, etc.) → rechazar
  const hasGarbage = GARBAGE_PATTERNS.some((p) => p.test(text));
  if (hasGarbage) return true;

  // Cuerpo muy corto sin contenido sustancial
  if (text.length < MIN_VALID_BODY_LENGTH) return true;

  return false;
}

/**
 * En correos reenviados con historial, extrae el primer mensaje reenviado (el del cliente real)
 * y el resto de la conversación como contexto para el resumen.
 */
function extractFirstForwardedBlockAndContext(body: string): {
  firstBlock: string;
  conversationContext: string;
} {
  const trimmed = body.trim();
  if (!trimmed) return { firstBlock: "", conversationContext: "" };

  let matchResult: { index: number; length: number } | null = null;
  for (const pattern of FORWARD_PATTERNS) {
    const m = trimmed.match(pattern);
    if (m && m.index !== undefined) {
      if (!matchResult || m.index < matchResult.index) {
        matchResult = { index: m.index, length: m[0].length };
      }
    }
  }

  if (!matchResult) {
    return { firstBlock: trimmed, conversationContext: "" };
  }

  const start = matchResult.index + matchResult.length;
  const afterHeader = trimmed.slice(start).replace(/^\s*\n?/, "");
  const nextBlock = afterHeader.match(NEXT_BLOCK_REGEX);
  const firstBlockEnd = nextBlock?.index ?? afterHeader.length;
  const firstBlock = afterHeader.slice(0, firstBlockEnd).trim();

  const restStart = nextBlock ? nextBlock.index! + nextBlock[0].length : afterHeader.length;
  const rest = afterHeader.slice(restStart).trim();
  const conversationContext =
    rest.length > 0 ? rest.slice(0, MAX_CONTEXT_CHARS) + (rest.length > MAX_CONTEXT_CHARS ? "…" : "") : "";

  return { firstBlock, conversationContext };
}

/**
 * Parsea el display name de un header From.
 * "Juan Pérez <juan@empresa.cl>" → { name: "Juan Pérez", email: "juan@empresa.cl" }
 * "juan@empresa.cl" → { name: null, email: "juan@empresa.cl" }
 */
export function parseFromHeader(from: string): { name: string | null; email: string } {
  const match = from.match(/^(.+?)\s*<([^>]+)>$/);
  if (match) {
    const name = match[1].replace(/^["']|["']$/g, "").trim();
    return { name: name || null, email: match[2].trim() };
  }
  return { name: null, email: from.trim() };
}

/**
 * Extrae datos de lead desde el contenido de un email (asunto + cuerpo).
 * Acepta HTML o texto plano.
 */
export async function extractLeadFromEmail(params: {
  subject: string;
  htmlBody?: string | null;
  textBody?: string | null;
  fromEmail?: string | null;
  ownDomain?: string | null;
  ownCompanyName?: string | null;
}): Promise<ExtractedLeadData> {
  let textBody = params.textBody?.trim() || stripHtml(params.htmlBody || "");

  const ownDomain = params.ownDomain || process.env.TENANT_DOMAIN || "";
  const ownCompanyName = params.ownCompanyName || process.env.TENANT_NAME || "";

  // Detectar reenvío: por dominio del remitente O por marcadores en el cuerpo
  const fromDomainIsOwn = params.fromEmail
    ? params.fromEmail.toLowerCase().includes(`@${ownDomain.toLowerCase()}`)
    : false;
  const bodyHasForwardMarkers = detectForwardInBody(textBody);
  const isForwarded = fromDomainIsOwn || bodyHasForwardMarkers;

  let conversationContext = "";
  if (isForwarded && textBody) {
    const { firstBlock, conversationContext: ctx } = extractFirstForwardedBlockAndContext(textBody);
    if (firstBlock && bodyHasForwardMarkers) {
      textBody = firstBlock;
      conversationContext = ctx;
    } else if (!bodyHasForwardMarkers && fromDomainIsOwn) {
      const quoted = extractQuotedReplyBlock(textBody);
      if (quoted && quoted.length > 50) {
        textBody = quoted;
      }
    }
  }

  const contentParts: string[] = [
    `Asunto: ${params.subject || "(sin asunto)"}`,
    !isForwarded && params.fromEmail ? `De: ${params.fromEmail}` : "",
    isForwarded
      ? `[NOTA: Este correo fue REENVIADO por un empleado de ${ownCompanyName}. Extrae contacto, empresa y datos SOLO del mensaje original abajo. IGNORA datos de ${ownCompanyName}, ${ownDomain} y del reenviador.]`
      : "",
  ];
  if (isForwarded) {
    contentParts.push("--- MENSAJE ORIGINAL (primer reenvío — extrae de aquí contacto, empresa y datos estructurados) ---");
  }
  contentParts.push(textBody);
  if (conversationContext) {
    contentParts.push(
      "--- CONTEXTO DE LA CONVERSACIÓN (usa para enriquecer el resumen ejecutivo del negocio) ---",
      conversationContext
    );
  }
  const content = contentParts.filter(Boolean).join("\n\n");

  if (!content.trim()) {
    console.warn("[email-lead-extractor] Empty content after processing, subject:", params.subject);
    return emptyResult(params.fromEmail || null, "Correo sin contenido extraíble.");
  }

  console.log("[email-lead-extractor] Sending to AI (AIService):", {
    subject: params.subject,
    isForwarded,
    fromDomainIsOwn,
    bodyHasForwardMarkers,
    contentLength: content.length,
    textBodyLength: textBody.length,
  });

  const systemPrompt = buildSystemPrompt(ownCompanyName, ownDomain);
  const fullPrompt = `${systemPrompt}\n\n--- CONTENIDO DEL CORREO ---\n\n${content}`;

  let parsed: Record<string, string>;
  try {
    const result = await aiService.generateJSON(fullPrompt, 1500);
    parsed = result && typeof result === "object" ? (result as Record<string, string>) : {};
  } catch (err) {
    console.warn("[email-lead-extractor] AIService error (NO_AI_CONFIGURED?):", err);
    throw err;
  }

  if (!parsed || Object.keys(parsed).length === 0) {
    console.warn("[email-lead-extractor] No content in AI response");
    return emptyResult(params.fromEmail || null, "No se pudo extraer información.");
  }

  try {
    const str = (key: string) => (parsed[key] != null ? String(parsed[key]).trim() : "") || null;

    const result: ExtractedLeadData = {
      companyName: str("companyName"),
      rut: str("rut"),
      legalName: str("legalName"),
      businessActivity: str("businessActivity"),
      legalRepresentativeName: str("legalRepresentativeName"),
      contactFirstName: str("contactFirstName"),
      contactLastName: str("contactLastName"),
      contactEmail: str("contactEmail") ?? (isForwarded ? null : params.fromEmail) ?? null,
      contactPhone: str("contactPhone"),
      contactRole: str("contactRole"),
      address: str("address"),
      city: str("city"),
      commune: str("commune"),
      serviceType: str("serviceType"),
      serviceDuration: str("serviceDuration"),
      coverageDetails: str("coverageDetails"),
      guardsPerShift: str("guardsPerShift"),
      numberOfLocations: str("numberOfLocations"),
      startDate: str("startDate"),
      summary: str("summary"),
      industry: str("industry"),
      website: str("website"),
    };

    const criticalEmpty = !result.contactFirstName && !result.contactEmail && !result.companyName && !result.summary;
    if (criticalEmpty) {
      console.warn("[email-lead-extractor] AI returned all critical fields empty. Raw:", JSON.stringify(parsed).slice(0, 500));
    }

    return result;
  } catch (parseErr) {
    console.error("[email-lead-extractor] Parse failed:", parseErr, "parsed:", JSON.stringify(parsed).slice(0, 500));
    return emptyResult(params.fromEmail || null, JSON.stringify(parsed).slice(0, 500));
  }
}

function emptyResult(email: string | null, summary: string): ExtractedLeadData {
  return {
    companyName: null,
    rut: null,
    legalName: null,
    businessActivity: null,
    legalRepresentativeName: null,
    contactFirstName: null,
    contactLastName: null,
    contactEmail: email,
    contactPhone: null,
    contactRole: null,
    address: null,
    city: null,
    commune: null,
    serviceType: null,
    serviceDuration: null,
    coverageDetails: null,
    guardsPerShift: null,
    numberOfLocations: null,
    startDate: null,
    summary,
    industry: null,
    website: null,
  };
}
