/**
 * API Route: /api/ai/position-description
 * POST - Redacta las observaciones de un puesto CPQ con IA y las persiste.
 * Modelado sobre /api/ai/quote-service-detail (mismo patrón de auth, IA,
 * refusal-guard e historial).
 */

import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { aiService } from "@/lib/ai-service";
import { AIError } from "@/lib/ai-errors";
import { requireAuth, unauthorized } from "@/lib/api-auth";
import { createCrmHistoryLog } from "@/lib/crm-history";
import { formatWeekdaysLong } from "@/lib/cpq/weekdays";
import { AI_REFUSAL_REGEX } from "@/modules/cpq/descriptions/generate-descriptions";

export async function POST(request: NextRequest) {
  try {
    const ctx = await requireAuth();
    if (!ctx) return unauthorized();

    const { quoteId, positionId, customInstruction } = await request.json();
    if (!quoteId || !positionId) {
      return NextResponse.json(
        { success: false, error: "quoteId y positionId son requeridos" },
        { status: 400 },
      );
    }

    // Aislamiento multi-tenant: la cotización se busca por id + tenantId, y el
    // puesto se acota a esa cotización (no hay relación account directa en el
    // modelo CpqQuote, así que el nombre de cuenta se resuelve aparte).
    const quote = await prisma.cpqQuote.findFirst({
      where: { id: quoteId, tenantId: ctx.tenantId },
      include: {
        installation: true,
        positions: {
          where: { id: positionId },
          include: { puestoTrabajo: true, cargo: true, rol: true, serviceGroup: true },
        },
      },
    });

    const position = quote?.positions[0];
    if (!quote || !position) {
      return NextResponse.json(
        { success: false, error: "Puesto no encontrado" },
        { status: 404 },
      );
    }

    // Contexto de cliente (opcional).
    let accountName = quote.clientName || "";
    if (quote.accountId) {
      const account = await prisma.crmAccount.findUnique({
        where: { id: quote.accountId },
        select: { name: true },
      });
      if (account?.name) accountName = account.name;
    }

    const puestoName = position.customName || position.puestoTrabajo?.name || "Puesto";
    const guardsInPos = Math.max(1, Number(position.numGuards || 1)) * Math.max(1, Number(position.numPuestos || 1));
    const serviceName = position.serviceGroup?.name?.trim() || "";
    const serviceNotes = position.serviceGroup?.notes?.trim() || "";
    const currentDraft = (position.description ?? "").trim();

    const systemPrompt = `Eres redactor comercial de una empresa de seguridad privada en Chile. Redacta las observaciones de un puesto de guardia para una cotización: 2 a 4 frases, máximo 480 caracteres, español de Chile, tono profesional y concreto. Describe funciones y protocolos del turno. Prohibido: precios, promesas legales o de resultados, nombres de personas, viñetas.`;

    const contextLines = [
      `- Puesto: ${puestoName}`,
      serviceName ? `- Servicio: ${serviceName}` : "",
      serviceNotes ? `- Notas del servicio: ${serviceNotes}` : "",
      position.cargo?.name ? `- Cargo: ${position.cargo.name}` : "",
      position.rol?.name ? `- Rol: ${position.rol.name}` : "",
      `- Horario: ${position.startTime || "-"}–${position.endTime || "-"}`,
      `- Días: ${formatWeekdaysLong(position.weekdays)}`,
      `- Dotación: ${position.numGuards} guardia(s) × ${position.numPuestos || 1} puesto(s) (${guardsInPos} en total)`,
      accountName ? `- Cliente: ${accountName}` : "",
      quote.installation?.name ? `- Instalación: ${quote.installation.name}` : "",
    ].filter(Boolean);

    const userPrompt = `${systemPrompt}

DATOS DEL PUESTO:
${contextLines.join("\n")}
${currentDraft ? `\nBORRADOR ACTUAL A MEJORAR (reescríbelo, no lo copies literal):\n${currentDraft}` : ""}${
      customInstruction?.trim()
        ? `\n\nINSTRUCCIÓN ADICIONAL DEL USUARIO (aplicar al texto): ${customInstruction.trim()}`
        : ""
    }

INSTRUCCIONES:
1. Devuelve SOLO el texto de las observaciones, sin encabezados ni viñetas.
2. Describe funciones y protocolos concretos del turno según los datos.
3. No inventes servicios, equipos ni alcances que los datos no mencionen.
4. Máximo 480 caracteres, 2 a 4 frases.
5. OBLIGATORIO: SIEMPRE genera el texto con los datos disponibles. NUNCA respondas que falta información, NUNCA hagas preguntas.`;

    let text = (
      await aiService.generateText(userPrompt, { maxTokens: 300, temperature: 0.5 }, { tenantId: ctx.tenantId })
    ).trim();

    // Un rechazo del LLM no puede persistirse: se reintenta reforzando y, si
    // insiste, se devuelve error para que se edite a mano.
    if (AI_REFUSAL_REGEX.test(text)) {
      const retryPrompt = `${userPrompt}

RECORDATORIO FINAL: Tu respuesta anterior no fue válida. Genera SIEMPRE las observaciones con los datos entregados, aunque te parezcan incompletos. No pidas información ni hagas preguntas.`;
      text = (
        await aiService.generateText(retryPrompt, { maxTokens: 300, temperature: 0.5 }, { tenantId: ctx.tenantId })
      ).trim();
    }

    if (AI_REFUSAL_REGEX.test(text) || !text) {
      console.warn(`[CPQ-AI] LLM refusal persistente en observaciones de ${quote.code}; no se guarda`);
      return NextResponse.json(
        {
          success: false,
          error: "No fue posible redactar las observaciones, edítalas manualmente",
          code: "AI_REFUSAL",
        },
        { status: 422 },
      );
    }

    // El editor cotea el textarea a 500 caracteres; se respeta el mismo límite.
    const description = text.slice(0, 500);

    await prisma.cpqPosition.update({
      where: { id: position.id },
      data: { description },
    });

    await createCrmHistoryLog({
      tenantId: ctx.tenantId,
      entityType: "quote",
      entityId: quoteId,
      action: "quote_position_ai_description",
      details: { quoteCode: quote.code, positionId: position.id },
      createdBy: ctx.userId,
    });

    return NextResponse.json({
      success: true,
      data: { description },
    });
  } catch (error) {
    if (error instanceof AIError) {
      return NextResponse.json(error.toResponse(), { status: error.clientHttpStatus });
    }
    console.error("Error generating AI position description:", error);
    const message = error instanceof Error ? error.message : "Failed to generate position description";
    return NextResponse.json(
      { success: false, error: message, code: "INTERNAL_ERROR" },
      { status: 500 },
    );
  }
}
