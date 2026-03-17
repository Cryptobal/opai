/**
 * API Route: /api/crm/contacts/[id]/send-presentation
 * POST - Send company presentation to a prospect contact
 *
 * 1. Validates contact exists, has email, has account
 * 2. Checks for existing active presentation (reuses if exists)
 * 3. Ensures portal access (PIN) exists
 * 4. Creates/updates CrmCompanyPresentation record
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
    const { notes } = body as { notes?: string };

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

    // 3. Ensure portal access — always resolve a real PIN for the email
    let pin: string;
    let portalAccessCreated = false;
    if (!contact.portalPin) {
      portalAccessCreated = true;
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
    } else if (contact.portalPinVisible && contact.portalPinVisible.trim().length > 0) {
      pin = contact.portalPinVisible;
    } else {
      pin = String(Math.floor(1000 + Math.random() * 9000));
      const pinHash = await bcrypt.hash(pin, 10);
      await prisma.crmContact.update({
        where: { id: contactId },
        data: { portalPin: pinHash, portalPinVisible: pin },
      });
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

    // 4. Create or reuse CrmCompanyPresentation record
    let presentation;
    const isResend = !!activePresentation;
    if (activePresentation) {
      presentation = await prisma.crmCompanyPresentation.update({
        where: { id: activePresentation.id },
        data: {
          sentAt: new Date(),
          sentById: ctx.userId,
          status: "sent",
        },
      });
    } else {
      presentation = await prisma.crmCompanyPresentation.create({
        data: {
          tenantId: ctx.tenantId,
          contactId,
          status: "sent",
          sentById: ctx.userId,
        },
      });
    }

    // 5. Get ejecutivo name
    const ejecutivo = await prisma.admin.findUnique({
      where: { id: ctx.userId },
      select: { name: true },
    });
    const ejecutivoName = ejecutivo?.name || "Ejecutivo Comercial";

    // 6. Send email
    const tenantConfig = await getTenantCompanyConfig(ctx.tenantId);
    const basePortalUrl = `${process.env.NEXT_PUBLIC_APP_URL || "https://opai.gard.cl"}/portal/cliente`;
    const portalUrl = `${basePortalUrl}?email=${encodeURIComponent(contact.email)}`;
    const contactName = `${contact.firstName} ${contact.lastName}`.trim();

    const emailHtml = await render(
      CompanyPresentationEmail({
        contactName,
        companyName: contact.account.name,
        email: contact.email,
        pin,
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

    // 7. Log in CRM history
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
