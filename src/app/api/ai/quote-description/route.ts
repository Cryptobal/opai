/**
 * API Route: /api/ai/quote-description
 * POST - Generate AI description for a CPQ quote
 */

import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { aiGenerate } from "@/lib/ai-service";
import { requireAuth, unauthorized } from "@/lib/api-auth";
import { computeCpqQuoteCosts } from "@/modules/cpq/costing/compute-quote-costs";
import { formatCurrency } from "@/lib/utils";
import { clpToUf, getUfValue } from "@/lib/uf";

export async function POST(request: NextRequest) {
  try {
    const ctx = await requireAuth();
    if (!ctx) return unauthorized();

    const { quoteId, customInstruction } = await request.json();
    if (!quoteId) {
      return NextResponse.json(
        { success: false, error: "quoteId es requerido" },
        { status: 400 }
      );
    }

    // Fetch quote with full context
    const quote = await prisma.cpqQuote.findFirst({
      where: { id: quoteId, tenantId: ctx.tenantId },
      include: {
        positions: {
          include: { puestoTrabajo: true, cargo: true },
        },
        installation: true,
        parameters: true,
      },
    });

    if (!quote) {
      return NextResponse.json(
        { success: false, error: "Cotización no encontrada" },
        { status: 404 }
      );
    }

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

    // Get costs and compute sale price (same logic used by send/create presentation)
    let monthlyTotal = Number(quote.monthlyCost) || 0;
    let salePriceMonthly = 0;
    try {
      const costs = await computeCpqQuoteCosts(quoteId);
      monthlyTotal = costs.monthlyTotal;
      const marginPct = Number(quote.parameters?.marginPct ?? 13);
      const margin = marginPct / 100;
      const costsBase =
        costs.monthlyPositions +
        (costs.monthlyUniforms ?? 0) +
        (costs.monthlyExams ?? 0) +
        (costs.monthlyMeals ?? 0) +
        (costs.monthlyVehicles ?? 0) +
        (costs.monthlyInfrastructure ?? 0) +
        (costs.monthlyCostItems ?? 0);
      const bwm = margin < 1 ? costsBase / (1 - margin) : costsBase;
      salePriceMonthly = bwm + (costs.monthlyFinancial ?? 0) + (costs.monthlyPolicy ?? 0);
    } catch {
      // fallback to stored monthlyCost
    }
    if (!salePriceMonthly || salePriceMonthly <= 0) {
      salePriceMonthly = monthlyTotal;
    }

    const quoteCurrency = (quote.currency || "CLP").toUpperCase();
    const displaySalePrice =
      quoteCurrency === "UF"
        ? formatCurrency(clpToUf(salePriceMonthly, await getUfValue()), "UF", { ufSuffix: true })
        : formatCurrency(salePriceMonthly, quoteCurrency);
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

    const prompt = `Eres el Gerente de Operaciones de Gard Security (https://gard.cl), empresa líder en seguridad privada profesional en Chile.

CONTEXTO: Este texto irá en la página 2 (Resumen Ejecutivo) de una propuesta comercial. Debe ser breve, directo y contundente.

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
- Precio mensual ofertado: ${displaySalePrice}

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
- Si no hay sitio web ni datos de empresa, NO inventes historia corporativa; enfócate en instalación, dotación y necesidad operativa
- OBLIGATORIO: Al describir la dotación de guardias, menciona explícitamente los DÍAS de cobertura (ej: "entre semana", "fines de semana", "todos los días 24x7", "viernes a domingo") usando lenguaje claro para el cliente, según los días indicados en cada puesto

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

    const description = await aiGenerate(prompt, {
      maxTokens: 500,
      temperature: 0.7,
    });

    // Save to quote
    await prisma.cpqQuote.update({
      where: { id: quoteId },
      data: { aiDescription: description },
    });

    return NextResponse.json({
      success: true,
      data: { description },
    });
  } catch (error) {
    console.error("Error generating AI description:", error);
    return NextResponse.json(
      { success: false, error: "Failed to generate description" },
      { status: 500 }
    );
  }
}
