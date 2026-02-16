/**
 * API Route: /api/ai/quote-service-detail
 * POST - Generate AI service detail for a CPQ quote proposal
 * Lists what's included in the service based on enabled cost items
 */

import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { openai } from "@/lib/openai";
import { requireAuth, unauthorized } from "@/lib/api-auth";

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
    const positionsSummary = quote.positions
      .map(
        (p) =>
          `${p.customName || p.puestoTrabajo?.name || "Puesto"}: ${p.numGuards} guardia(s), horario ${p.startTime}-${p.endTime}, días: ${(p.weekdays || []).join(", ")}`
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
      ["phone", "radio", "flashlight"].includes(c.catalogItem?.type || "")
    );
    if (operationalItems.length > 0) {
      const opNames = operationalItems.map((c) => c.catalogItem?.name || "Equipo").join(", ");
      includedItems.push(`Equipos operativos: ${opNames}`);
    }

    const transportItems = activeCostItems.filter((c) => c.catalogItem?.type === "transport");
    if (transportItems.length > 0) {
      const tNames = transportItems.map((c) => c.catalogItem?.name || "Transporte").join(", ");
      includedItems.push(`Transporte: ${tNames}`);
    }

    const systemItems = activeCostItems.filter((c) => c.catalogItem?.type === "system");
    if (systemItems.length > 0) {
      const sNames = systemItems.map((c) => c.catalogItem?.name || "Sistema").join(", ");
      includedItems.push(`Sistemas: ${sNames}`);
    }

    // Vehicles
    const vehicleCostItems = activeCostItems.filter((c) =>
      ["vehicle_rent", "vehicle_fuel", "vehicle_tag"].includes(c.catalogItem?.type || "")
    );
    const activeVehicles = quote.vehicles.filter((v) => v.isEnabled);
    if (vehicleCostItems.length > 0 || activeVehicles.length > 0) {
      const vNames = vehicleCostItems.map((c) => c.catalogItem?.name || "Vehículo").join(", ");
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
      ["infrastructure", "fuel"].includes(c.catalogItem?.type || "")
    );
    if (infraCostItems.length > 0 && activeInfra.length === 0) {
      const iNames = infraCostItems.map((c) => c.catalogItem?.name || "Infraestructura").join(", ");
      includedItems.push(`Infraestructura: ${iNames}`);
    }

    // Other/custom items
    const otherItems = activeCostItems.filter((c) =>
      !["phone", "radio", "flashlight", "transport", "system", "vehicle_rent", "vehicle_fuel", "vehicle_tag", "infrastructure", "fuel", "financial", "policy"].includes(c.catalogItem?.type || "")
    );
    if (otherItems.length > 0) {
      const oNames = otherItems.map((c) => c.catalogItem?.name || "Otro").join(", ");
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

    const prompt = `Eres el Gerente Comercial de Gard Security, empresa de seguridad privada profesional en Chile.

CONTEXTO: Necesitas crear un detalle profesional de lo que incluye el servicio de seguridad propuesto. Este texto irá en la propuesta económica, justo debajo de la descripción del servicio y antes del total.

DATOS DEL SERVICIO:
- Cliente: ${accountName}
${installationName ? `- Instalación: ${installationName}` : ""}
- Puestos de trabajo:
  ${positionsSummary}
- Total guardias: ${quote.totalGuards}

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
11. OBLIGATORIO: En el primer ítem (dotación de guardias) debes describir explícitamente los DÍAS de trabajo de cada tipo de puesto, usando lenguaje claro para el cliente. Por ejemplo: "todos los días (24x7)", "de lunes a viernes", "fines de semana (sábado y domingo)", "viernes a domingo", "entre semana" + "fines de semana" si hay puestos con distintos días. No uses solo "Lun, Mar..."; traduce a cómo lo entiende el cliente (ej: 2 guardias día entre semana + 2 guardias noche entre semana + 1 guardia noche fin de semana).

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

    const completion = await openai.chat.completions.create({
      model: "gpt-4o-mini",
      messages: [{ role: "user", content: prompt }],
      max_tokens: 600,
      temperature: 0.5,
    });

    const serviceDetail = completion.choices[0]?.message?.content?.trim() || "";

    // Save to quote
    await prisma.cpqQuote.update({
      where: { id: quoteId },
      data: { serviceDetail },
    });

    return NextResponse.json({
      success: true,
      data: { serviceDetail },
    });
  } catch (error) {
    console.error("Error generating AI service detail:", error);
    return NextResponse.json(
      { success: false, error: "Failed to generate service detail" },
      { status: 500 }
    );
  }
}
