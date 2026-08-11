/**
 * API Route: /api/ai/lead-cost-inference
 * POST - Infiere qué grupos de costo incluir en la cotización a partir del contenido del lead (email, notas).
 * Body: { leadId: string }
 * Response: { success: true, groupIds: string[] } con IDs: uniform, exam, meal, equipment, transport, vehicle, infrastructure, system
 */

import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { getTenantOpenAIClient } from "@/lib/ai/tenant-openai";
import { requireAuth, unauthorized } from "@/lib/api-auth";
import { getFileBuffer } from "@/lib/storage";
import { extractText } from "@/lib/knowledge/extract";
import {
  DOC_TEXT_MAX_PER_FILE,
  DOC_TEXT_MAX_TOTAL,
  truncateDocText,
} from "@/lib/ai/document-text-budget";

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
      attachmentTexts?: string[];
    } | null;
    const emailText = meta?.inboundEmail?.text?.trim() || "";
    const emailSubject = meta?.inboundEmail?.subject?.trim() || "";
    const notes = (lead.notes || "").trim();
    const companyName = (lead.companyName || "").trim();
    const cachedAtt =
      Array.isArray(meta?.attachmentTexts)
        ? meta!.attachmentTexts!.filter((t): t is string => typeof t === "string").join("\n\n")
        : "";

    // Adjuntos vinculados al lead (pliegos / RFI) — antes se ignoraban.
    let linkedDocText = "";
    try {
      const links = await prisma.documentoEnlace.findMany({
        where: { tenantId: ctx.tenantId, entityType: "lead", entityId: lead.id },
        take: 4,
        select: {
          file: { select: { storageKey: true, mimeType: true, fileName: true } },
        },
      });
      let budget = DOC_TEXT_MAX_TOTAL;
      for (const link of links) {
        if (budget <= 0) break;
        const f = link.file;
        if (!f?.storageKey) continue;
        try {
          const buf = await getFileBuffer(f.storageKey);
          const raw = (await extractText(buf, f.mimeType)).trim();
          if (!raw) continue;
          const per = Math.min(DOC_TEXT_MAX_PER_FILE, budget);
          const page = truncateDocText(raw, per, { label: f.fileName });
          linkedDocText += `\n\n[Adjunto lead: ${f.fileName}]\n${page.text}`;
          budget -= Math.min(raw.length, per);
        } catch {
          /* best-effort */
        }
      }
    } catch {
      /* best-effort */
    }

    const textToAnalyze = [
      emailSubject,
      emailText,
      notes,
      companyName,
      cachedAtt,
      linkedDocText,
    ]
      .filter(Boolean)
      .join("\n\n");
    if (!textToAnalyze) {
      return NextResponse.json({
        success: true,
        groupIds: ["uniform", "exam"],
      });
    }

    const prompt = `Eres un asistente que analiza solicitudes de cotización de servicios de seguridad (guardias, vigilancia).

TEXTO DEL LEAD (email, asunto, notas, empresa, adjuntos):
---
${textToAnalyze.slice(0, DOC_TEXT_MAX_TOTAL)}
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

    const client = await getTenantOpenAIClient(ctx.tenantId);
    const completion = await client.chat.completions.create({
      model: "gpt-4o-mini",
      messages: [{ role: "user", content: prompt }],
      max_tokens: 200,
      temperature: 0.2,
    });

    const raw = completion.choices[0]?.message?.content?.trim() || "";
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
