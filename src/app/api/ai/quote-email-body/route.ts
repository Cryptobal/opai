/**
 * API Route: /api/ai/quote-email-body
 * POST - Generate AI email body for sending a CPQ quote PDF
 */

import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { aiService } from "@/lib/ai-service";
import { AIError } from "@/lib/ai-errors";
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

    let accountIndustry: string | null = null;
    let accountSummarySnippet: string | null = null;
    if (quote.accountId) {
      const linkedAccount = await prisma.crmAccount.findFirst({
        where: { id: quote.accountId, tenantId: ctx.tenantId },
        select: { industry: true, notes: true },
      });
      if (linkedAccount) {
        accountIndustry = linkedAccount.industry?.trim() || null;
        const rawNotes = linkedAccount.notes?.trim();
        if (rawNotes) {
          const cleaned = rawNotes.replace(/\[\[ACCOUNT_LOGO_URL:[^\]]+\]\]\n?/g, "").trim();
          accountSummarySnippet = cleaned.slice(0, 600).trim() || null;
        }
      }
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
    const baseUrl = process.env.NEXT_PUBLIC_APP_URL || process.env.NEXT_PUBLIC_SITE_URL || "";
    const portalUrl = `${baseUrl}/portal/cliente`;

    // Positions summary
    const totalGuards = quote.positions.reduce(
      (sum, p) => sum + (p.numGuards || 1) * (p.numPuestos || 1),
      0
    );
    const positionsList = quote.positions
      .map((p) => p.customName || p.puestoTrabajo?.name || "Puesto")
      .join(", ");

    const portalLine = portalEnabled && portalPin
      ? "Una linea breve invitando a ingresar al portal de cliente (ej: 'Te invito tambien a ingresar a tu portal de cliente para revisar la propuesta de forma interactiva.'). NO incluir link ni PIN ni lista de beneficios."
      : "Una linea breve mencionando el portal (ej: 'Te invito a conocer nuestro Portal de Cliente cuando lo actives.').";

    const prompt = `Eres ${senderName}${senderCargo ? `, ${senderCargo}` : ""} de ${companyConfig.commercialName}, empresa de seguridad privada en Chile.

Escribe SOLO el cuerpo del email para enviar una propuesta economica adjunta en PDF. El correo tiene un diseno visual que ya incluye saludo, credenciales de portal, beneficios y firma. Tu texto va en el centro.

DATOS DE LA PROPUESTA:
- Destinatario (primer nombre): ${contactFirstName}
- Guardias: ${totalGuards}
- Puestos: ${positionsList || "No definidos aun"}
- Instalacion: ${quote.installation?.name || "No especificada"}
- Vigencia: ${quote.validUntil ? new Date(quote.validUntil).toLocaleDateString("es-CL") : "No definida"}
${accountIndustry ? `- Industria (cliente): ${accountIndustry}` : ""}
${accountSummarySnippet ? `- Resumen empresa (dato interno, no mencionar literalmente esta etiqueta si suena redundante):\n"${accountSummarySnippet}"` : ""}

INSTRUCCIONES ESTRICTAS:
1. Comenzar con "Hola ${contactFirstName}," (tutear, NUNCA "usted" ni "Estimado/a")
2. Parrafo 1: desarrollar en un mismo bloque corto lo siguiente —
   SI hay datos de rubro/industria (${accountIndustry ? "si disponible según línea anterior" : "NO hay campo industria disponible"}), puedes usar UNA frase breve y natural contextualizando (sin clichés de "somos líderes del rubro").
   Si NO hay industria, omitir ese matiz; no inventes un rubro.
   También menciona la propuesta adjunta en lineas generales (guardias, puestos, instalación según aplique).
   Si aparece bloque Resumen empresa en datos, puedes usarlo solo como contexto factual (sin copiar párrafos ni citar esa etiqueta).
3. Parrafo 2: indicar que el detalle completo esta en el PDF adjunto
4. Parrafo 3: ${portalLine}
5. Cierre breve (ej: "Quedo disponible para cualquier consulta.")
6. NO incluir firma, NO incluir lista de beneficios, NO incluir link ni PIN
7. NO incluir precios (estan en el PDF)
8. Dejar una linea en blanco entre parrafos
9. Idioma: espanol Chile
10. Maximo 400 caracteres${
      customInstruction?.trim()
        ? `\n\nINSTRUCCION ADICIONAL: ${customInstruction.trim()}`
        : ""
    }`;

    const body = (
      await aiService.generateText(prompt, { maxTokens: 450, temperature: 0.6 }, { tenantId: ctx.tenantId })
    ).trim();

    return NextResponse.json({ success: true, data: { body } });
  } catch (error) {
    if (error instanceof AIError) {
      return NextResponse.json(error.toResponse(), { status: error.clientHttpStatus });
    }
    console.error("Error generating email body:", error);
    const message = error instanceof Error ? error.message : "Error generando email";
    return NextResponse.json(
      { success: false, error: message, code: "INTERNAL_ERROR" },
      { status: 500 }
    );
  }
}
