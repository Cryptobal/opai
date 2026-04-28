/**
 * API Route: /api/ai/lead-description
 * POST - Generate AI description for a lead installation (no quoteId required)
 * Accepts raw position/cost data and generates company description or service detail.
 */

import { NextRequest, NextResponse } from "next/server";
import { aiService } from "@/lib/ai-service";
import { AIError } from "@/lib/ai-errors";
import { requireAuth, unauthorized } from "@/lib/api-auth";
import { getTenantCompanyConfig } from "@/lib/tenant-config";

export async function POST(request: NextRequest) {
  try {
    const ctx = await requireAuth();
    if (!ctx) return unauthorized();

    const body = await request.json();
    const {
      type,
      accountName,
      industry,
      installationName,
      city,
      positions,
      costItems,
      customInstruction,
    } = body;

    if (!type || !["company", "service"].includes(type)) {
      return NextResponse.json(
        { success: false, error: "type must be 'company' or 'service'" },
        { status: 400 }
      );
    }

    if (!positions || !Array.isArray(positions) || positions.length === 0) {
      return NextResponse.json(
        { success: false, error: "Debe haber al menos un puesto configurado" },
        { status: 400 }
      );
    }

    const cfg = await getTenantCompanyConfig(ctx.tenantId);
    const totalGuardias = positions.reduce(
      (sum: number, p: any) => sum + (Number(p.cantidad) || 1) * (Number(p.numPuestos) || 1),
      0
    );
    const totalPuestos = positions.reduce(
      (sum: number, p: any) => sum + (Number(p.numPuestos) || 1),
      0
    );

    const positionsSummary = positions
      .map(
        (p: any) =>
          `${p.customName || p.puesto || "Puesto"}: ${p.numPuestos || 1} puesto(s), ${p.cantidad || 1} guardia(s) por puesto, ${p.horaInicio || "08:00"}-${p.horaFin || "20:00"}, días: ${(p.dias || []).join(", ")}`
      )
      .join("\n");

    const enabledCosts = Array.isArray(costItems)
      ? costItems.filter((c: any) => c.enabled).map((c: any) => c.name).join(", ")
      : "";

    if (type === "company") {
      const prompt = `Eres el Gerente de Operaciones de ${cfg.commercialName}, empresa líder en seguridad privada profesional en Chile.

CONTEXTO: Este texto irá en la propuesta comercial, justo antes de la tabla de puestos.

FORMATO DE SALIDA:
- NO incluyas encabezados ni títulos. Comienza directamente con el texto narrativo.
- Usa texto plano, sin markdown. Separa párrafos con doble salto de línea.

Contexto del cliente:
- Cliente: ${accountName || "Cliente"}
${industry ? `- Industria: ${industry}` : ""}
${installationName ? `- Instalación: ${installationName}` : ""}
${city ? `- Ciudad: ${city}` : ""}

Servicio propuesto:
${positionsSummary}
- Total puestos: ${totalPuestos}
- Total guardias: ${totalGuardias}

El texto debe:
1. Conectar el servicio con la realidad del cliente
2. Describir el servicio concreto propuesto
3. Transmitir valor único y confianza

Requisitos:
- MÁXIMO 1,350 caracteres
- 3-4 párrafos cortos
- Tono ejecutivo, directo
- NO inventes datos que no están proporcionados
- OBLIGATORIO: Mencionar días de cobertura según los datos${
        customInstruction?.trim()
          ? `\n\nINSTRUCCIÓN ADICIONAL: ${customInstruction.trim()}`
          : ""
      }`;

      let description = (
        await aiService.generateText(prompt, { maxTokens: 500, temperature: 0.7 })
      ).trim();
      description = description
        .replace(/^#\s*RESUMEN\s*EJECUTIVO\s*\n?/i, "")
        .replace(/^Resumen\s*Ejecutivo\s*\n?/i, "")
        .trim();

      return NextResponse.json({ success: true, data: { description } });
    } else {
      // Service detail
      const includedItems: string[] = [];
      includedItems.push(
        `Dotación: ${totalPuestos} puesto(s) con ${totalGuardias} guardia(s) efectivo(s)`
      );
      for (const p of positions) {
        includedItems.push(
          `- ${p.customName || p.puesto || "Puesto"}: ${p.cantidad || 1} guardia(s), ${p.horaInicio}-${p.horaFin}, ${(p.dias || []).length} días/semana`
        );
      }
      if (enabledCosts) {
        includedItems.push(`Costos operativos incluidos: ${enabledCosts}`);
      }

      const prompt = `Eres el Gerente de Operaciones de ${cfg.commercialName}. Genera el DETALLE DE SERVICIO para una propuesta comercial.

FORMATO: Texto plano, sin markdown. Párrafos separados por doble salto de línea.

SERVICIO:
${includedItems.join("\n")}

INSTRUCCIONES:
1. Describir el alcance operativo concreto
2. Mencionar la cobertura de turnos, días y horarios
3. Incluir los elementos operativos que se proveen
4. Máximo 800 caracteres
5. Tono profesional y específico${
        customInstruction?.trim()
          ? `\n\nINSTRUCCIÓN ADICIONAL: ${customInstruction.trim()}`
          : ""
      }`;

      let serviceDetail = (
        await aiService.generateText(prompt, { maxTokens: 400, temperature: 0.7 })
      ).trim();

      return NextResponse.json({ success: true, data: { description: serviceDetail } });
    }
  } catch (error) {
    if (error instanceof AIError) {
      return NextResponse.json(error.toResponse(), { status: error.clientHttpStatus });
    }
    console.error("Error generating lead description:", error);
    const message = error instanceof Error ? error.message : "Error al generar descripción";
    return NextResponse.json({ success: false, error: message, code: "INTERNAL_ERROR" }, { status: 500 });
  }
}
