/**
 * API Route: /api/crm/contacts/[id]/send-presentation
 * POST - Send company presentation to a prospect contact
 *
 * 1. Validates contact exists, has email, account is prospect
 * 2. Checks no active presentation exists (status sent/viewed)
 * 3. Creates CrmCompanyPresentation record
 * 4. Ensures portal access (PIN) exists
 * 5. Sends email via Resend with CompanyPresentationEmail template
 */

import { NextRequest, NextResponse } from "next/server";
import { render } from "@react-email/render";
import { prisma } from "@/lib/prisma";
import { resend, EMAIL_CONFIG } from "@/lib/resend";
import { requireAuth, unauthorized } from "@/lib/api-auth";
import { getTenantCompanyConfig } from "@/lib/tenant-config";
import { CompanyPresentationEmail } from "@/emails/CompanyPresentationEmail";
import bcrypt from "bcryptjs";

export async function POST(
  _request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const ctx = await requireAuth();
    if (!ctx) return unauthorized();

    const { id: contactId } = await params;
    const body = await _request.json().catch(() => ({}));
    const { templateId, notes, installationId } = body as {
      templateId?: string;
      notes?: string;
      installationId?: string;
    };

    // 1. Fetch contact with account
    const contact = await prisma.crmContact.findFirst({
      where: { id: contactId, tenantId: ctx.tenantId },
      select: {
        id: true,
        firstName: true,
        lastName: true,
        email: true,
        phone: true,
        accountId: true,
        portalEnabled: true,
        portalPin: true,
        portalPinVisible: true,
        account: {
          select: {
            id: true,
            name: true,
            rut: true,
            status: true,
          },
        },
      },
    });

    if (!contact) {
      return NextResponse.json(
        { success: false, error: "Contacto no encontrado" },
        { status: 404 }
      );
    }

    if (!contact.email) {
      return NextResponse.json(
        { success: false, error: "El contacto no tiene email" },
        { status: 400 }
      );
    }

    if (!contact.account) {
      return NextResponse.json(
        { success: false, error: "El contacto no tiene cuenta asociada" },
        { status: 400 }
      );
    }

    // 2. Check for existing active presentation (reuse if exists)
    const activePresentation = await prisma.crmCompanyPresentation.findFirst({
      where: {
        contactId,
        tenantId: ctx.tenantId,
        status: { in: ["sent", "viewed"] },
      },
    });

    // 3. Resolve template
    let resolvedTemplateId = templateId || null;
    if (!resolvedTemplateId) {
      const defaultTemplate = await prisma.cpqProposalTemplate.findFirst({
        where: { tenantId: ctx.tenantId, slug: "company-presentation" },
        select: { id: true },
      });
      resolvedTemplateId = defaultTemplate?.id || null;
    }

    // 4. Ensure portal access
    let pin: string;
    let portalAccessCreated = false;
    if (!contact.portalPin) {
      pin = String(Math.floor(1000 + Math.random() * 9000));
      const pinHash = await bcrypt.hash(pin, 10);
      await prisma.crmContact.update({
        where: { id: contactId },
        data: {
          portalPin: pinHash,
          portalPinVisible: pin,
          portalEnabled: true,
        },
      });
      portalAccessCreated = true;
    } else {
      pin = contact.portalPinVisible || "****";
    }

    // Ensure account has portalEjecutivoId set
    if (contact.account.status !== "client_active") {
      await prisma.crmAccount.update({
        where: { id: contact.account.id },
        data: {
          status: "prospect",
          portalEjecutivoId: ctx.userId,
        },
      });
    }

    // 5. Create or reuse CrmCompanyPresentation record
    let presentation;
    const isResend = !!activePresentation;
    if (activePresentation) {
      // Reuse existing presentation — update sentAt and notes
      presentation = await prisma.crmCompanyPresentation.update({
        where: { id: activePresentation.id },
        data: {
          sentAt: new Date(),
          sentById: ctx.userId,
          notes: notes || activePresentation.notes,
          status: "sent",
          installationId: installationId || activePresentation.installationId,
          templateId: resolvedTemplateId || activePresentation.templateId,
        },
      });
    } else {
      presentation = await prisma.crmCompanyPresentation.create({
        data: {
          tenantId: ctx.tenantId,
          contactId,
          installationId: installationId || null,
          templateId: resolvedTemplateId,
          status: "sent",
          sentById: ctx.userId,
          notes: notes || null,
        },
      });
    }

    // 6. Get ejecutivo name
    const ejecutivo = await prisma.admin.findUnique({
      where: { id: ctx.userId },
      select: { name: true },
    });
    const ejecutivoName = ejecutivo?.name || "Ejecutivo Comercial";

    // 7. Send email
    const tenantConfig = await getTenantCompanyConfig(ctx.tenantId);
    const basePortalUrl = `${process.env.NEXT_PUBLIC_APP_URL || "https://opai.gard.cl"}/portal/cliente`;
    const portalUrl = `${basePortalUrl}?email=${encodeURIComponent(contact.email)}`;
    const contactName = `${contact.firstName} ${contact.lastName}`.trim();

    const emailHtml = await render(
      CompanyPresentationEmail({
        contactName,
        companyName: contact.account.name,
        email: contact.email,
        pin: portalAccessCreated ? pin : undefined,
        portalUrl,
        ejecutivoName,
        notes: notes || undefined,
        brandName: tenantConfig.commercialName,
      })
    );

    const emailResult = await resend.emails.send({
      from: EMAIL_CONFIG.from,
      to: contact.email,
      cc: tenantConfig.email ? [tenantConfig.email] : undefined,
      replyTo: tenantConfig.emailReplyTo || EMAIL_CONFIG.replyTo,
      subject: `Presentación de servicios — ${tenantConfig.commercialName}`,
      html: emailHtml,
      tags: [
        { name: "type", value: "company-presentation" },
        { name: "presentationId", value: presentation.id },
      ],
    });

    // 8. Log in CRM history
    await prisma.crmHistoryLog.create({
      data: {
        tenantId: ctx.tenantId,
        entityType: "contact",
        entityId: contactId,
        action: isResend ? "company_presentation_resent" : "company_presentation_sent",
        details: {
          to: contact.email,
          contactName,
          presentationId: presentation.id,
          emailId: emailResult?.data?.id || null,
          portalUrl,
          portalAccessCreated,
          isResend,
        },
        createdBy: ctx.userId,
      },
    });

    return NextResponse.json({
      success: true,
      presentation,
      portalAccessCreated,
    });
  } catch (error) {
    console.error("Error sending company presentation:", error);
    return NextResponse.json(
      { success: false, error: "Error al enviar la presentación" },
      { status: 500 }
    );
  }
}
