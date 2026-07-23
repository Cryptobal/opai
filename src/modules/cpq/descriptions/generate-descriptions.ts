/**
 * Reusable functions for generating AI descriptions for CPQ quotes.
 * Extracted from /api/ai/quote-description so they can be called
 * from approve, approve-and-send, and the API endpoint itself.
 */

import { prisma } from "@/lib/prisma";
import { aiService } from "@/lib/ai-service";

/**
 * Detecta respuestas en las que el LLM se niega a redactar o pide más datos.
 * Ese texto nunca debe persistirse ni llegar al PDF: se reintenta y, si
 * persiste, se usa un fallback determinístico.
 * Compartido con el render del PDF y con /api/ai/quote-service-detail.
 */
export const AI_REFUSAL_REGEX =
  /no puedo (completar|generar)|falta información crítica|necesito que completes/i;

export async function generateQuoteDescription(
  quoteId: string,
  options?: { tenantId?: string; userId?: string; customInstruction?: string }
): Promise<string> {
  const quote = await prisma.cpqQuote.findFirst({
    where: { id: quoteId, ...(options?.tenantId ? { tenantId: options.tenantId } : {}) },
    include: {
      positions: { include: { puestoTrabajo: true, cargo: true } },
      installation: true,
      parameters: true,
    },
  });

  if (!quote) throw new Error("Cotización no encontrada");

  // Get account info if linked
  let accountName = quote.clientName || "Cliente";
  let accountIndustry = "";
  let accountWebsite = "";
  if (quote.accountId) {
    const account = await prisma.crmAccount.findUnique({
      where: { id: quote.accountId },
      select: { name: true, industry: true, website: true },
    });
    if (account) {
      accountName = account.name;
      accountIndustry = account.industry || "";
      accountWebsite = account.website || "";
    }
  }

  const companySource =
    accountWebsite.trim().length > 0
      ? "Cuenta con datos web"
      : "Sin datos web (lead manual/correo genérico)";

  // Build positions summary
  const totalGuardiasEfectivos = quote.positions.reduce(
    (sum, p) => sum + Math.max(1, Number(p.numPuestos || 1)) * Math.max(1, Number(p.numGuards || 1)),
    0
  );
  const totalPuestos = quote.positions.reduce(
    (sum, p) => sum + Math.max(1, Number(p.numPuestos || 1)),
    0
  );
  const positionsSummary = quote.positions
    .map(
      (p) =>
        `${p.customName || p.puestoTrabajo?.name || "Puesto"}: ${Math.max(1, Number(p.numPuestos || 1))} puesto(s), ${p.numGuards} guardia(s) por puesto, ${p.startTime}-${p.endTime}, días: ${(p.weekdays || []).join(", ")}`
    )
    .join("\n");

  const city = quote.installation?.city || "";
  const installationName = quote.installation?.name || "";
  const customInstruction = options?.customInstruction;

  // Líneas adicionales: son el único contenido cuando no hay guardias, y hasta
  // ahora la IA no las veía en ninguna de las dos ramas.
  const additionalLines = await prisma.cpqQuoteAdditionalLine.findMany({
    where: { quoteId },
    orderBy: { orden: "asc" },
  });
  const linesSummary = additionalLines
    .map(
      (l) =>
        `- ${l.nombre}${l.descripcion ? `: ${l.descripcion}` : ""} (${
          (l.recurrencia ?? "mensual") === "unico" ? "pago único" : "mensual"
        })`,
    )
    .join("\n");

  const hasGuards = quote.positions.length > 0;

  const noGuardsPrompt = `Eres un experto comercial en seguridad privada profesional en Chile.

CONTEXTO: Esta es una cotización de productos/servicios adicionales, SIN dotación de guardias. El texto irá en la propuesta comercial, justo antes del detalle de los servicios cotizados. Debe ser breve, directo y contundente.

IMPORTANTE - FORMATO DE SALIDA:
- NO incluyas encabezados ni títulos al inicio (ej: "Resumen Ejecutivo"). Comienza directamente con el texto narrativo.
- NO incluyas metadata al final (caracteres, palabras, conteo). Solo el texto narrativo.
- Usa texto plano, sin markdown. Separa párrafos con doble salto de línea.

DATOS:
- Cliente: ${accountName}
${accountIndustry ? `- Industria/Rubro: ${accountIndustry}` : ""}
${installationName ? `- Instalación: ${installationName}` : ""}
${city ? `- Ciudad: ${city}` : ""}

SERVICIOS / PRODUCTOS COTIZADOS:
${linesSummary}

El texto debe:
1. Describir qué se está cotizando, usando las descripciones de las líneas
2. Explicar su valor práctico para la operación del cliente
3. Conectar con la realidad del cliente (industria, instalación, ciudad) cuando haya datos

Requisitos CRÍTICOS:
- MÁXIMO 700 caracteres, en 1 o 2 párrafos cortos
- Tono: ejecutivo, directo, memorable
- PROHIBIDO mencionar guardias, dotación, puestos, turnos o vigilancia con personal: esta cotización NO incluye personal
- PROHIBIDO mencionar montos, precios, tarifas o cualquier cifra monetaria (ni en UF ni en $). El precio se presenta aparte en la propuesta.
- PROHIBIDO inventar servicios o características que no estén en la lista de servicios cotizados
- OBLIGATORIO: SIEMPRE debes generar el texto con los datos disponibles. NUNCA respondas que falta información, NUNCA hagas preguntas, NUNCA digas que no puedes completar la propuesta.${
    customInstruction?.trim()
      ? `\n\nINSTRUCCIÓN ADICIONAL DEL USUARIO (aplicar al texto): ${customInstruction.trim()}`
      : ""
  }${
    quote.aiDescription?.trim() && customInstruction?.trim()
      ? `\n\nTEXTO ACTUAL A REFINAR:\n${quote.aiDescription.trim()}`
      : ""
  }`;

  const guardsPrompt = `Eres un experto en seguridad privada profesional en Chile.

CONTEXTO: Este texto irá en la propuesta comercial, justo antes de la tabla de puestos. Debe ser breve, directo y contundente.

IMPORTANTE - FORMATO DE SALIDA:
- NO incluyas encabezados ni títulos al inicio (ej: "Resumen Ejecutivo", "# Resumen Ejecutivo"). Comienza directamente con el texto narrativo.
- NO incluyas metadata al final (caracteres, palabras, conteo). Solo el texto narrativo.
- Usa texto plano, sin markdown. Separa párrafos con doble salto de línea para legibilidad.

PASO 1: Contexto del cliente
- Cliente: ${accountName}
${accountIndustry ? `- Industria/Rubro: ${accountIndustry}` : ""}
${accountWebsite ? `- Sitio web: ${accountWebsite}` : ""}
${`- Origen de datos empresa: ${companySource}`}
${installationName ? `- Instalación: ${installationName}` : ""}
${city ? `- Ciudad: ${city}` : ""}

PASO 2: Crear texto personalizado
- Servicio propuesto:
${positionsSummary}
- Total puestos: ${totalPuestos}
- Total guardias efectivos: ${totalGuardiasEfectivos}
${linesSummary ? `\nLÍNEAS ADICIONALES INCLUIDAS:\n${linesSummary}` : ""}

El texto debe:
1. Conectar el servicio con la realidad específica del cliente
2. Describir el servicio concreto propuesto
3. Transmitir valor único y confianza
4. Cada palabra debe contar

Requisitos CRÍTICOS:
- MÁXIMO 1,350 caracteres (aproximadamente 200-220 palabras)
- Estructura en 3-4 párrafos cortos
- Prioriza: Cliente + Servicio concreto + Valor diferencial
- Tono: ejecutivo, directo, memorable
- NO inventes características que no están en los datos
- PROHIBIDO mencionar montos, precios, tarifas, inversión mensual o cualquier cifra monetaria (ni en UF ni en $). El precio se presenta aparte en la propuesta; el texto solo describe el servicio y su valor.
- Si no hay sitio web ni datos de empresa, NO inventes historia corporativa; enfócate en instalación, dotación y necesidad operativa
- OBLIGATORIO: Al describir la dotación de guardias, menciona explícitamente los DÍAS de cobertura (ej: "entre semana", "fines de semana", "todos los días 24x7", "viernes a domingo") usando lenguaje claro para el cliente, según los días indicados en cada puesto
${linesSummary ? "- OBLIGATORIO: Menciona brevemente las líneas adicionales incluidas, sin precios" : ""}
- OBLIGATORIO: SIEMPRE debes generar el texto con los datos disponibles. NUNCA respondas que falta información, NUNCA hagas preguntas, NUNCA digas que no puedes completar la propuesta.

Estructura ideal:
1. Para [Cliente] + contexto industria/ciudad
2. Servicio específico propuesto
3. Valor diferencial de Gard en 1 línea${
    customInstruction?.trim()
      ? `\n\nINSTRUCCIÓN ADICIONAL DEL USUARIO (aplicar al texto): ${customInstruction.trim()}`
      : ""
  }${
    quote.aiDescription?.trim() && customInstruction?.trim()
      ? `\n\nTEXTO ACTUAL A REFINAR:\n${quote.aiDescription.trim()}`
      : ""
  }`;

  const prompt = hasGuards ? guardsPrompt : noGuardsPrompt;

  const sanitize = (text: string) =>
    text
      .replace(/^#\s*RESUMEN\s*EJECUTIVO\s*\n?/i, "")
      .replace(/^Resumen\s*Ejecutivo\s*\n?/i, "")
      .replace(/\n?\*\*Caracteres:\s*[\d.,]+\s*\|\s*Palabras:\s*[\d.]+\*\*\s*$/i, "")
      .replace(/\n?Caracteres:\s*[\d.,]+\s*\|\s*Palabras:\s*[\d.]+\s*$/i, "")
      .trim();

  const isRefusal = (text: string) => AI_REFUSAL_REGEX.test(text) || /\?\s*$/.test(text);

  let description = sanitize(
    await aiService.generateText(prompt, { maxTokens: 500, temperature: 0.7 }, { tenantId: options?.tenantId, feature: "cpq-service-description" }),
  );

  // Un rechazo del LLM no puede persistirse: se reintenta reforzando y, si
  // insiste, se cae a un texto determinístico armado con los datos que hay.
  if (isRefusal(description)) {
    const retryPrompt = `${prompt}

RECORDATORIO FINAL: Tu respuesta anterior no fue válida. Genera SIEMPRE el texto narrativo con los datos entregados, aunque te parezcan incompletos. No pidas información, no hagas preguntas y no digas que no puedes completar la propuesta.`;
    description = sanitize(
      await aiService.generateText(retryPrompt, { maxTokens: 500, temperature: 0.7 }, { tenantId: options?.tenantId, feature: "cpq-service-description" }),
    );
  }

  if (isRefusal(description) || !description) {
    console.warn(`[CPQ-AI] LLM refusal persistente en ${quote.code}; usando fallback determinístico`);
    const linesText = additionalLines.map((l) => l.descripcion || l.nombre).join("; ");
    description = `Propuesta para ${accountName}${installationName ? ` — ${installationName}` : ""}.${
      linesText ? ` Incluye: ${linesText}.` : ""
    }`;
  }

  // Save to quote
  await prisma.cpqQuote.update({
    where: { id: quoteId },
    data: { aiDescription: description },
  });

  if (options?.tenantId && options?.userId) {
    const { createCrmHistoryLog } = await import("@/lib/crm-history");
    await createCrmHistoryLog({
      tenantId: options.tenantId,
      entityType: "quote",
      entityId: quoteId,
      action: "quote_ai_description",
      details: { quoteCode: quote.code },
      createdBy: options.userId,
    });
  }

  return description;
}
