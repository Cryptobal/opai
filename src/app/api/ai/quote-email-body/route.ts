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

    // Contact name + portal credentials
    let contactName = quote.clientName || "Cliente";
    let contactFirstName = contactName.split(" ")[0];
    let portalPin: string | null = null;
    let portalEnabled = false;
    if (quote.contactId) {
      const contact = await prisma.crmContact.findUnique({
        where: { id: quote.contactId },
        select: { firstName: true, lastName: true, portalPinVisible: true, portalEnabled: true },
      });
      if (contact) {
        contactName = `${contact.firstName} ${contact.lastName}`.trim();
        contactFirstName = contact.firstName;
        portalPin = contact.portalPinVisible || null;
        portalEnabled = contact.portalEnabled ?? false;
      }
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
    const baseUrl = process.env.NEXT_PUBLIC_APP_URL || "https://opai.gard.cl";
    const portalUrl = `${baseUrl}/portal/cliente`;

    // Positions summary
    const totalGuards = quote.positions.reduce(
      (sum, p) => sum + (p.numGuards || 1) * (p.numPuestos || 1),
      0
    );
    const positionsList = quote.positions
      .map((p) => p.customName || p.puestoTrabajo?.name || "Puesto")
      .join(", ");

    const portalBlock = portalEnabled && portalPin
      ? `
Ademas del PDF, te invito a ingresar a tu Portal de Cliente de ${companyConfig.commercialName || "Gard Security"}, una experiencia que nos diferencia del mercado. Ahi puedes:

- Revisar la propuesta en detalle: puestos, horarios, guardias asignados y precio mensual, todo claro y sin letra chica.
- Acceder a la propuesta tecnica completa con condiciones comerciales y respaldo legal.
- Monitorear el servicio en tiempo real: una vez activo el contrato, ver cumplimiento de rondas, alertas y metricas de seguridad desde tu celular.
- Contactarme directamente para resolver dudas, ajustar condiciones o agendar una reunion.
- Aprobar la propuesta en un clic si te convence, sin papeleo.

Tu acceso al portal:
Portal: ${portalUrl}
Tu PIN: ${portalPin}`
      : `
Te invito tambien a conocer nuestro Portal de Cliente, donde podras revisar la propuesta de forma interactiva y monitorear el servicio en tiempo real una vez activo el contrato. Es una experiencia que nos diferencia del resto del mercado. Consulta tu ejecutivo para activar tu acceso.`;

    const firmaBlock = `${senderName}
${senderCargo}
${companyConfig.commercialName || "Gard Security"}
${companyConfig.phone || ""}
${companyConfig.email || ""}`;

    const prompt = `Eres ${senderName}${senderCargo ? `, ${senderCargo}` : ""} de ${companyConfig.commercialName || "Gard Security"}, empresa de seguridad privada en Chile.

Escribe un email para enviar una propuesta economica adjunta en PDF. Usa el contenido exacto que se indica abajo, adaptando el lenguaje de forma natural. NO inventes informacion adicional.

DATOS DE LA PROPUESTA:
- Destinatario (primer nombre): ${contactFirstName}
- Guardias: ${totalGuards}
- Puestos: ${positionsList || "No definidos aun"}
- Instalacion: ${quote.installation?.name || "No especificada"}
- Vigencia: ${quote.validUntil ? new Date(quote.validUntil).toLocaleDateString("es-CL") : "No definida"}

INSTRUCCIONES ESTRICTAS:
1. Comenzar con "Hola ${contactFirstName}," (tutear siempre, NUNCA usar "usted", NUNCA "Estimado/a")
2. Dejar una linea en blanco entre cada parrafo
3. Parrafo 1: presentar brevemente la propuesta adjunta (guardias, puestos, instalacion)
4. Parrafo 2: indicar que el detalle completo esta en el PDF adjunto
5. Incluir literalmente este bloque de portal (no modificar los datos):
${portalBlock}
6. Linea de cierre breve y cercana (ej: "Quedo disponible para cualquier consulta.")
7. Dejar DOS lineas en blanco antes de la firma
8. Firma exactamente asi, cada dato en su propia linea sin asteriscos ni markdown:
${firmaBlock}
9. NO incluir precios en el cuerpo del email (estan en el PDF)
10. NO incluir "Asunto:" ni titulos
11. Idioma: espanol Chile${
      customInstruction?.trim()
        ? `\n\nINSTRUCCION ADICIONAL DEL USUARIO: ${customInstruction.trim()}`
        : ""
    }`;

    const body = (
      await aiService.generateText(prompt, { maxTokens: 700, temperature: 0.6 })
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
