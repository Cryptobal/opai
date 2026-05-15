/**
 * API Route: /api/ai/lead-email-body
 * POST - Borrador IA para el mensaje al enviar presentación institucional a un contacto/prospecto
 */

import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { aiService } from "@/lib/ai-service";
import { AIError } from "@/lib/ai-errors";
import { requireAuth, unauthorized } from "@/lib/api-auth";
import { getTenantCompanyConfig } from "@/lib/tenant-config";

function stripLogoMarker(raw: string | undefined | null): string {
  const t = raw?.trim();
  if (!t) return "";
  return t.replace(/\[\[ACCOUNT_LOGO_URL:[^\]]+\]\]\n?/g, "").trim();
}

export async function POST(request: NextRequest) {
  try {
    const ctx = await requireAuth();
    if (!ctx) return unauthorized();

    const body = await request.json();
    const contactId = body.contactId as string | undefined;
    const leadId = body.leadId as string | undefined;
    const installationId = body.installationId as string | undefined;
    const customInstruction = typeof body.customInstruction === "string" ? body.customInstruction : undefined;

    if (!contactId) {
      return NextResponse.json({ success: false, error: "contactId es requerido" }, { status: 400 });
    }

    const contact = await prisma.crmContact.findFirst({
      where: { id: contactId, tenantId: ctx.tenantId },
      select: {
        id: true,
        firstName: true,
        lastName: true,
        accountId: true,
        account: {
          select: {
            name: true,
            industry: true,
            notes: true,
          },
        },
      },
    });

    if (!contact?.accountId || !contact.account) {
      return NextResponse.json(
        { success: false, error: "Contacto o cuenta CRM no encontrada" },
        { status: 404 },
      );
    }

    let installationName: string | null = null;
    if (installationId) {
      const inst = await prisma.crmInstallation.findFirst({
        where: {
          id: installationId,
          tenantId: ctx.tenantId,
          accountId: contact.accountId,
          status: { in: ["prospect", "active"] },
        },
        select: { name: true },
      });
      installationName = inst?.name ?? null;
    }

    let leadIndustry: string | null = null;
    let leadCompany: string | null = null;
    if (leadId) {
      const lead = await prisma.crmLead.findFirst({
        where: { id: leadId, tenantId: ctx.tenantId },
        select: { industry: true, industryType: true, companyName: true },
      });
      if (lead) {
        leadIndustry = lead.industry?.trim() || lead.industryType?.trim() || null;
        leadCompany = lead.companyName?.trim() || null;
      }
    }

    const summaryFromAccount = stripLogoMarker(contact.account.notes)?.slice(0, 620) || null;
    const industry =
      contact.account.industry?.trim() || leadIndustry || null;

    const companyDisplay = contact.account.name || leadCompany || "su empresa";

    const sender = await prisma.admin.findUnique({
      where: { id: ctx.userId },
      select: { name: true },
    });

    const companyConfig = await getTenantCompanyConfig(ctx.tenantId);
    const senderName = sender?.name || "Equipo Comercial";
    const recipientFirstName = contact.firstName?.trim() || "ahí";

    const prompt =
      `Eres ${senderName} de ${companyConfig.commercialName}, empresa chilena de seguridad privada.\n\n` +
      `Escribes solo el TEXTO PERSONAL que irá dentro de un correo institucional que ya muestra marca, firma y CTA al Portal del cliente (presentación corporativa).\n\n` +
      `DATOS\n` +
      `- Primer nombre destinatario: ${recipientFirstName}\n` +
      `- Empresa del contacto (referencia factual): ${companyDisplay}\n` +
      `- Industria conocida${industry ? `: ${industry}` : `: (no viene en datos)`}\n` +
      `- Resumen contexto empresa (si hay, basado solo en estos datos):\n${summaryFromAccount || "(vacío)"}\n` +
      `- Instalación prospecto mencionada: ${installationName || "sin especificar"}\n\n` +
      `INSTRUCCIONES\n` +
      `1. Tutear (${recipientFirstName}, "te", "tu"). Sin "usted" ni "Estimado/a"\n` +
      `2. Un solo párrafo corto (máximo 380 caracteres) — sin firma ni despedida corporativa redundante.\n` +
      `3. Indica brevemente que compartimos la presentación institucional vía Portal de Cliente sin pegar enlaces ni PIN.\n` +
      `4. Si hay rubro/industria en datos (${industry ? "si" : "no"}): máximo medio renglón relacionando ese contexto sin sonar telemarketing.` +
      ` Si no hay rubro/industria omitir ese matiz; no inventes un sector ficticio ni afirmaciones incómodas.\n` +
      `5. No inventes hechos números certificaciones ni SLA; sin precios ni plazos comerciales concretos.\n` +
      `6. Idioma español Chile.\n` +
      `${customInstruction?.trim() ? `\nInstrucción adicional: ${customInstruction.trim()}` : ""}`;

    const text = (
      await aiService.generateText(prompt, { maxTokens: 320, temperature: 0.55 }, { tenantId: ctx.tenantId })
    ).trim();

    return NextResponse.json({ success: true, data: { body: text } });
  } catch (error) {
    if (error instanceof AIError) {
      return NextResponse.json(error.toResponse(), { status: error.clientHttpStatus });
    }
    console.error("Error generating lead presentation email draft:", error);
    const message = error instanceof Error ? error.message : "Error generando borrador";
    return NextResponse.json(
      { success: false, error: message, code: "INTERNAL_ERROR" },
      { status: 500 },
    );
  }
}
