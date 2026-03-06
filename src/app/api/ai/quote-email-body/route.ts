/**
 * API Route: /api/ai/quote-email-body
 * POST - Generate AI email body for sending a CPQ quote PDF
 */

import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { aiService } from "@/lib/ai-service";
import { requireAuth, unauthorized } from "@/lib/api-auth";
import { getTenantCompanyConfig } from "@/lib/tenant-config";

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

    const quote = await prisma.cpqQuote.findFirst({
      where: { id: quoteId, tenantId: ctx.tenantId },
      include: {
        positions: { include: { puestoTrabajo: true } },
        installation: true,
      },
    });

    if (!quote) {
      return NextResponse.json(
        { success: false, error: "Cotizacion no encontrada" },
        { status: 404 }
      );
    }

    // Contact name
    let contactName = quote.clientName || "Cliente";
    if (quote.contactId) {
      const contact = await prisma.crmContact.findUnique({
        where: { id: quote.contactId },
        select: { firstName: true, lastName: true },
      });
      if (contact) contactName = `${contact.firstName} ${contact.lastName}`.trim();
    }

    // Sender (current user)
    const sender = await prisma.admin.findUnique({
      where: { id: ctx.userId },
      select: { name: true, cargo: true },
    });
    const senderName = sender?.name || "Equipo Comercial";
    const senderCargo = sender?.cargo || "";

    // Company config
    const companyConfig = await getTenantCompanyConfig(ctx.tenantId);

    // Positions summary
    const totalGuards = quote.positions.reduce(
      (sum, p) => sum + (p.numGuards || 1) * (p.numPuestos || 1),
      0
    );
    const positionsList = quote.positions
      .map((p) => p.customName || p.puestoTrabajo?.name || "Puesto")
      .join(", ");

    const prompt = `Eres ${senderName}${senderCargo ? `, ${senderCargo}` : ""} de ${companyConfig.commercialName || "Gard Security"}, empresa de seguridad privada en Chile.

Escribe un email profesional y breve (3-4 parrafos cortos) para enviar una propuesta economica adjunta en PDF.

DATOS:
- Destinatario: ${contactName}
- Guardias: ${totalGuards}
- Puestos: ${positionsList || "No definidos aun"}
- Instalacion: ${quote.installation?.name || "No especificada"}
- Vigencia: ${quote.validUntil ? new Date(quote.validUntil).toLocaleDateString("es-CL") : "No definida"}
- Empresa: ${companyConfig.commercialName || "Gard Security"}
- Telefono: ${companyConfig.phone}
- Email contacto empresa: ${companyConfig.email}
- Remitente: ${senderName}${senderCargo ? `, ${senderCargo}` : ""}

INSTRUCCIONES:
1. Comenzar directamente con "Estimado/a ${contactName}" (NO incluir linea de asunto ni titulo)
2. Breve mencion de que se adjunta una propuesta economica
3. Indicar que el detalle completo esta en el PDF adjunto
4. Cierre profesional firmando como ${senderName}${senderCargo ? `, ${senderCargo}` : ""} con datos de contacto de la empresa
5. NO incluir precios en el email (estan en el PDF)
6. NO incluir linea de "Asunto:" ni el codigo de cotizacion como titulo
7. Maximo 800 caracteres
8. Tono profesional pero cercano
9. Idioma: espanol Chile${
      customInstruction?.trim()
        ? `\n\nINSTRUCCION ADICIONAL DEL USUARIO: ${customInstruction.trim()}`
        : ""
    }`;

    const body = (
      await aiService.generateText(prompt, { maxTokens: 400, temperature: 0.7 })
    ).trim();

    return NextResponse.json({ success: true, data: { body } });
  } catch (error) {
    console.error("Error generating email body:", error);
    const message = error instanceof Error ? error.message : "Error generando email";
    return NextResponse.json(
      { success: false, error: message },
      { status: 500 }
    );
  }
}
