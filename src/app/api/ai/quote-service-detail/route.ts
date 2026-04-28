/**
 * API Route: /api/ai/quote-service-detail
 * POST - Generate AI service detail for a CPQ quote proposal
 * Lists what's included in the service based on enabled cost items
 */

import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { aiService } from "@/lib/ai-service";
import { AIError } from "@/lib/ai-errors";
import { requireAuth, unauthorized } from "@/lib/api-auth";
import { createCrmHistoryLog } from "@/lib/crm-history";
import { getTenantCompanyConfig } from "@/lib/tenant-config";
import { formatWeekdaysLong } from "@/lib/cpq/weekdays";

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
        uniformItems: { include: { catalogItem: true } },
        examItems: { include: { catalogItem: true } },
        costItems: { include: { catalogItem: true } },
        meals: true,
        vehicles: true,
        infrastructure: true,
        installation: true,
      },
    });

    if (!quote) {
      return NextResponse.json(
        { success: false, error: "Cotización no encontrada" },
        { status: 404 }
      );
    }

    // Build included items list
    const includedItems: string[] = [];

    // Positions summary
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
          `${p.customName || p.puestoTrabajo?.name || "Puesto"}: ${Math.max(1, Number(p.numPuestos || 1))} puesto(s), ${p.numGuards} guardia(s) por puesto, horario ${p.startTime}-${p.endTime}, días: ${formatWeekdaysLong(p.weekdays)}`
      )
      .join("\n  ");

    // Uniforms
    const activeUniforms = quote.uniformItems.filter((u) => u.active);
    if (activeUniforms.length > 0) {
      const uniformNames = activeUniforms.map((u) => u.catalogItem?.name || "Uniforme").join(", ");
      includedItems.push(`Uniformes: ${uniformNames}`);
    }

    // Exams
    const activeExams = quote.examItems.filter((e) => e.active);
    if (activeExams.length > 0) {
      const examNames = activeExams.map((e) => e.catalogItem?.name || "Examen").join(", ");
      includedItems.push(`Exámenes: ${examNames}`);
    }

    // Meals
    const activeMeals = quote.meals.filter((m) => m.isEnabled && (m.mealsPerDay > 0 || m.daysOfService > 0));
    if (activeMeals.length > 0) {
      const mealNames = activeMeals.map((m) => m.mealType).join(", ");
      includedItems.push(`Alimentación: ${mealNames}`);
    }

    // Cost items (operational, transport, system, etc.)
    const activeCostItems = quote.costItems.filter((c) => c.isEnabled);
    const operationalItems = activeCostItems.filter((c) =>
      ["phone", "radio", "flashlight"].includes(c.customType ?? c.catalogItem?.type ?? "")
    );
    if (operationalItems.length > 0) {
      const opNames = operationalItems.map((c) => c.customName ?? c.catalogItem?.name ?? "Equipo").join(", ");
      includedItems.push(`Equipos operativos: ${opNames}`);
    }

    const transportItems = activeCostItems.filter((c) => (c.customType ?? c.catalogItem?.type) === "transport");
    if (transportItems.length > 0) {
      const tNames = transportItems.map((c) => c.customName ?? c.catalogItem?.name ?? "Transporte").join(", ");
      includedItems.push(`Transporte: ${tNames}`);
    }

    const systemItems = activeCostItems.filter((c) => (c.customType ?? c.catalogItem?.type) === "system");
    if (systemItems.length > 0) {
      const sNames = systemItems.map((c) => c.customName ?? c.catalogItem?.name ?? "Sistema").join(", ");
      includedItems.push(`Sistemas: ${sNames}`);
    }

    // Vehicles
    const vehicleCostItems = activeCostItems.filter((c) =>
      ["vehicle_rent", "vehicle_fuel", "vehicle_tag"].includes(c.customType ?? c.catalogItem?.type ?? "")
    );
    const activeVehicles = quote.vehicles.filter((v) => v.isEnabled);
    if (vehicleCostItems.length > 0 || activeVehicles.length > 0) {
      const vNames = vehicleCostItems.map((c) => c.customName ?? c.catalogItem?.name ?? "Vehículo").join(", ");
      const vCount = activeVehicles.length;
      const vehicleDesc = vNames || (vCount > 0 ? `${vCount} vehículo(s)` : "Vehículo");
      includedItems.push(`Vehículos: ${vehicleDesc}`);
    }

    // Infrastructure
    const activeInfra = quote.infrastructure.filter((i) => i.isEnabled);
    if (activeInfra.length > 0) {
      const infraNames = activeInfra.map((i) => i.itemType).join(", ");
      includedItems.push(`Infraestructura: ${infraNames}`);
    }

    // Infrastructure cost items (stored as CpqQuoteCostItem with type "infrastructure" or "fuel")
    const infraCostItems = activeCostItems.filter((c) =>
      ["infrastructure", "fuel"].includes(c.customType ?? c.catalogItem?.type ?? "")
    );
    if (infraCostItems.length > 0 && activeInfra.length === 0) {
      const iNames = infraCostItems.map((c) => c.customName ?? c.catalogItem?.name ?? "Infraestructura").join(", ");
      includedItems.push(`Infraestructura: ${iNames}`);
    }

    // Other/custom items
    const otherItems = activeCostItems.filter((c) =>
      !["phone", "radio", "flashlight", "transport", "system", "vehicle_rent", "vehicle_fuel", "vehicle_tag", "infrastructure", "fuel", "financial", "policy"].includes(c.customType ?? c.catalogItem?.type ?? "")
    );
    if (otherItems.length > 0) {
      const oNames = otherItems.map((c) => c.customName ?? c.catalogItem?.name ?? "Otro").join(", ");
      includedItems.push(`Otros: ${oNames}`);
    }

    // Get account name
    let accountName = quote.clientName || "Cliente";
    if (quote.accountId) {
      const account = await prisma.crmAccount.findUnique({
        where: { id: quote.accountId },
        select: { name: true },
      });
      if (account) accountName = account.name;
    }

    const installationName = quote.installation?.name || "";
    const itemsList = includedItems.length > 0
      ? includedItems.map((i) => `- ${i}`).join("\n")
      : "- No hay ítems adicionales configurados";

    const cfg = await getTenantCompanyConfig(ctx.tenantId);
    const prompt = `Eres el Gerente Comercial de ${cfg.commercialName}, empresa de seguridad privada profesional en Chile.

CONTEXTO: Necesitas crear un detalle profesional de lo que incluye el servicio de seguridad propuesto. Este texto irá en la propuesta económica, justo debajo de la descripción del servicio y antes del total.

DATOS DEL SERVICIO:
- Cliente: ${accountName}
${installationName ? `- Instalación: ${installationName}` : ""}
- Puestos de trabajo:
  ${positionsSummary}
- Total puestos: ${totalPuestos}
- Total guardias efectivos: ${totalGuardiasEfectivos}

ÍTEMS INCLUIDOS EN EL SERVICIO:
${itemsList}

INSTRUCCIONES:
1. Crea un texto profesional que detalle lo que incluye el servicio
2. Usa formato de lista con viñetas (•) para cada ítem
3. Cada ítem debe empezar con "Incluye" o un verbo similar (Incorpora, Contempla, etc.)
4. NO mencionar costos ni precios
5. Ser específico con lo que incluye cada ítem (ej: "Incluye uniformes completos con renovación periódica")
6. Máximo 8-10 líneas
7. Tono profesional y claro
8. Si hay exámenes, mencionar los tipos (preocupacionales, drogas, etc.)
9. Si hay equipos operativos con celular, mencionar "celular con plan de datos"
10. Si hay alimentación, detallar los tipos de comida
11. OBLIGATORIO: En el primer ítem (dotación de guardias) debes describir explícitamente los DÍAS de trabajo de cada tipo de puesto, usando lenguaje claro para el cliente. Por ejemplo: "todos los días (24x7)", "de lunes a viernes", "fines de semana (sábado y domingo)", "viernes a domingo", "entre semana" + "fines de semana" si hay puestos con distintos días. No uses solo "Lun, Mar..."; traduce a cómo lo entiende el cliente (ej: 2 guardias por puesto en 9 puestos nocturnos entre semana).
12. OBLIGATORIO: Considera explícitamente la relación "número de puestos" x "guardias por puesto" en la redacción, no la simplifiques a solo guardias totales.

Formato esperado (ejemplo):
El servicio contempla:
• Incluye dotación de X guardias en modalidad Y
• Incluye uniformes completos con renovación periódica
• Incorpora exámenes preocupacionales y de drogas
• Incluye alimentación (desayuno y colación)
• Incluye equipos operativos: celular con plan de datos
• Incluye sistema de gestión operacional${
      customInstruction?.trim()
        ? `\n\nINSTRUCCIÓN ADICIONAL DEL USUARIO (aplicar al texto): ${customInstruction.trim()}`
        : ""
    }${
      quote.serviceDetail?.trim() && customInstruction?.trim()
        ? `\n\nTEXTO ACTUAL A REFINAR:\n${quote.serviceDetail.trim()}`
        : ""
    }`;

    const serviceDetail = (
      await aiService.generateText(prompt, { maxTokens: 600, temperature: 0.5 })
    ).trim();

    // Save to quote
    await prisma.cpqQuote.update({
      where: { id: quoteId },
      data: { serviceDetail },
    });

    await createCrmHistoryLog({
      tenantId: ctx.tenantId,
      entityType: "quote",
      entityId: quoteId,
      action: "quote_ai_service_detail",
      details: { quoteCode: quote.code },
      createdBy: ctx.userId,
    });

    return NextResponse.json({
      success: true,
      data: { serviceDetail },
    });
  } catch (error) {
    if (error instanceof AIError) {
      return NextResponse.json(error.toResponse(), { status: error.clientHttpStatus });
    }
    console.error("Error generating AI service detail:", error);
    const message = error instanceof Error ? error.message : "Failed to generate service detail";
    return NextResponse.json(
      { success: false, error: message, code: "INTERNAL_ERROR" },
      { status: 500 }
    );
  }
}
