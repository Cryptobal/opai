/**
 * API Route: /api/ai/lead-cost-inference
 * POST - Infiere qué grupos de costo incluir en la cotización a partir del contenido del lead (email, notas).
 * Body: { leadId: string }
 * Response: { success: true, groupIds: string[] } con IDs: uniform, exam, meal, equipment, transport, vehicle, infrastructure, system
 */

import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { aiGenerate } from "@/lib/ai-service";
import { requireAuth, unauthorized } from "@/lib/api-auth";

const VALID_GROUP_IDS = new Set([
  "uniform",
  "exam",
  "meal",
  "equipment",
  "transport",
  "vehicle",
  "infrastructure",
  "system",
]);

function parseGroupIdsFromContent(content: string): string[] {
  const trimmed = content.trim();
  if (!trimmed) return [];
  try {
    const parsed = JSON.parse(trimmed) as unknown;
    if (!Array.isArray(parsed)) return [];
    return (parsed as unknown[])
      .filter((g): g is string => typeof g === "string" && VALID_GROUP_IDS.has(g))
      .filter((g, i, arr) => arr.indexOf(g) === i);
  } catch {
    return [];
  }
}

export async function POST(request: NextRequest) {
  try {
    const ctx = await requireAuth();
    if (!ctx) return unauthorized();

    const body = await request.json().catch(() => ({}));
    const leadId = body?.leadId;
    if (!leadId || typeof leadId !== "string") {
      return NextResponse.json(
        { success: false, error: "leadId es requerido" },
        { status: 400 }
      );
    }

    const lead = await prisma.crmLead.findFirst({
      where: { id: leadId, tenantId: ctx.tenantId },
      select: {
        id: true,
        notes: true,
        metadata: true,
        companyName: true,
        source: true,
      },
    });

    if (!lead) {
      return NextResponse.json(
        { success: false, error: "Lead no encontrado" },
        { status: 404 }
      );
    }

    const meta = lead.metadata as {
      inboundEmail?: { text?: string; subject?: string; html?: string };
    } | null;
    const emailText = meta?.inboundEmail?.text?.trim() || "";
    const emailSubject = meta?.inboundEmail?.subject?.trim() || "";
    const notes = (lead.notes || "").trim();
    const companyName = (lead.companyName || "").trim();

    const textToAnalyze = [emailSubject, emailText, notes, companyName].filter(Boolean).join("\n\n");
    if (!textToAnalyze) {
      return NextResponse.json({
        success: true,
        groupIds: ["uniform", "exam"],
      });
    }

    const prompt = `Eres un asistente que analiza solicitudes de cotización de servicios de seguridad (guardias, vigilancia).

TEXTO DEL LEAD (email, asunto, notas, empresa):
---
${textToAnalyze}
---

Debes devolver ÚNICAMENTE un array JSON de IDs de grupos de costo que deberían incluirse en la cotización, según lo que se menciona o se infiere del texto.

IDs válidos (usa exactamente estos strings):
- uniform: uniformes
- exam: exámenes (preocupacionales, psicológicos)
- meal: alimentación / comida
- equipment: equipos operativos (teléfono, radio, linterna)
- transport: traslado / movilización
- vehicle: vehículos (arriendo, combustible, TAG)
- infrastructure: infraestructura (caseta, baño, generador, combustible)
- system: sistemas (software, monitoreo)

Reglas:
- Para servicios de guardias/vigilancia incluye siempre al menos: uniform, exam.
- Si el texto menciona vehículo, auto, movilización, traslado: incluye vehicle y/o transport según corresponda.
- Si menciona alimentación, comida, colación: incluye meal.
- Si menciona equipos, radio, teléfono, linterna: incluye equipment.
- Si menciona caseta, infraestructura, generador: incluye infrastructure.
- Si menciona sistema, software, monitoreo: incluye system.
- Responde SOLO con el array JSON, sin explicación. Ejemplo: ["uniform","exam","equipment","system"]`;

    const raw = await aiGenerate(prompt, {
      maxTokens: 200,
      temperature: 0.2,
    });
    let groupIds = parseGroupIdsFromContent(raw);
    if (groupIds.length === 0) {
      groupIds = ["uniform", "exam"];
    }

    return NextResponse.json({
      success: true,
      groupIds,
    });
  } catch (error) {
    console.error("Error in lead-cost-inference:", error);
    return NextResponse.json(
      { success: false, error: "Error al inferir costos" },
      { status: 500 }
    );
  }
}
