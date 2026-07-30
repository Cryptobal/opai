/**
 * API Route: /api/cpq/bundles/[id]/send-presentation
 * POST - Envía propuesta consolidada (PDF adjunto) + marca estados
 */

import { NextRequest, NextResponse } from "next/server";
import { render } from "@react-email/render";
import { requireAuth, unauthorized } from "@/lib/api-auth";
import { requireCpqEdit } from "@/lib/api-auth-cpq";
import { requireTenantModule } from "@/lib/require-module";
import { prisma } from "@/lib/prisma";
import { resend, EMAIL_CONFIG } from "@/lib/resend";
import { PresentationEmail } from "@/emails/PresentationEmail";
import { buildBundleProposalProps } from "@/lib/pdf/templates/proposal/build-bundle-proposal-props";
import { renderProposalToBufferFromProps } from "@/lib/pdf/templates/proposal/render-proposal";
import { getTenantCompanyConfig } from "@/lib/tenant-config";
import { createCrmHistoryLog } from "@/lib/crm-history";

export const runtime = "nodejs";
export const maxDuration = 90;

export async function POST(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> },
) {
  try {
    const modCheck = await requireTenantModule("cpq");
    if (!modCheck.authorized) return modCheck.response;

    const ctx = await requireAuth();
    if (!ctx) return unauthorized();
    const forbidden = await requireCpqEdit(ctx);
    if (forbidden) return forbidden;

    const { id: bundleId } = await params;
    const body = await request.json().catch(() => ({}));
    const {
      recipientEmail: customEmail,
      recipientName: customName,
      ccEmails = [],
    } = body;

    const bundle = await prisma.cpqProposalBundle.findFirst({
      where: { id: bundleId, tenantId: ctx.tenantId },
      include: {
        quotes: {
          where: { includedInProposal: true },
          orderBy: { displayOrder: "asc" },
          select: { quoteId: true },
        },
      },
    });

    if (!bundle) {
      return NextResponse.json(
        { success: false, error: "Propuesta no encontrada" },
        { status: 404 },
      );
    }
    if (bundle.quotes.length === 0) {
      return NextResponse.json(
        {
          success: false,
          error: "No hay cotizaciones incluidas para enviar",
        },
        { status: 400 },
      );
    }
    if (!bundle.contactId) {
      return NextResponse.json(
        {
          success: false,
          error: "La propuesta debe tener un contacto asignado",
        },
        { status: 400 },
      );
    }

    const contact = await prisma.crmContact.findFirst({
      where: { id: bundle.contactId, tenantId: ctx.tenantId },
      select: {
        id: true,
        firstName: true,
        lastName: true,
        email: true,
      },
    });
    if (!contact?.email) {
      return NextResponse.json(
        { success: false, error: "El contacto no tiene email" },
        { status: 400 },
      );
    }

    const account = bundle.accountId
      ? await prisma.crmAccount.findFirst({
          where: { id: bundle.accountId, tenantId: ctx.tenantId },
          select: { name: true },
        })
      : null;

    const recipientEmail = customEmail || contact.email;
    const recipientName =
      customName ||
      `${contact.firstName} ${contact.lastName}`.trim();
    const companyName = account?.name || "Cliente";

    const { fileName, ...props } = await buildBundleProposalProps(
      bundleId,
      ctx.tenantId,
    );
    const pdfBuffer = await renderProposalToBufferFromProps(props);

    const quoteIds = bundle.quotes.map((q) => q.quoteId);
    const now = new Date();

    // Marcar cotizaciones incluidas como sent + portal visibility
    const quoteUpdate: {
      status: string;
      visibleInClientPortal?: boolean;
    } = { status: "sent" };
    if (bundle.visibleInClientPortal === true) {
      quoteUpdate.visibleInClientPortal = true;
    } else if (bundle.visibleInClientPortal === false) {
      quoteUpdate.visibleInClientPortal = false;
    }

    await prisma.cpqQuote.updateMany({
      where: { id: { in: quoteIds }, tenantId: ctx.tenantId },
      data: quoteUpdate,
    });

    await prisma.cpqProposalBundle.update({
      where: { id: bundleId },
      data: { status: "sent", sentAt: now },
    });

    // CrmCompanyPresentation (dedupe como en quotes)
    try {
      const existing = await prisma.crmCompanyPresentation.findFirst({
        where: {
          contactId: bundle.contactId,
          status: { in: ["sent", "viewed"] },
        },
      });
      if (!existing) {
        await prisma.crmCompanyPresentation.create({
          data: {
            tenantId: ctx.tenantId,
            contactId: bundle.contactId,
            sentById: ctx.userId,
            status: "sent",
            sentAt: now,
          },
        });
      }
    } catch (cpErr) {
      console.error("[bundle send] CrmCompanyPresentation:", cpErr);
    }

    const tenantCfg = await getTenantCompanyConfig(ctx.tenantId);
    const validUntilStr = bundle.validUntil
      ? new Date(bundle.validUntil).toLocaleDateString("es-CL", {
          year: "numeric",
          month: "long",
          day: "numeric",
        })
      : undefined;

    const siteUrl =
      process.env.NEXT_PUBLIC_SITE_URL ||
      process.env.SITE_URL ||
      "";

    const emailHtml = await render(
      PresentationEmail({
        recipientName,
        companyName,
        subject: `Propuesta consolidada de Servicio de Seguridad - ${companyName}`,
        presentationUrl: siteUrl || "#",
        quoteNumber: bundle.code,
        senderName: tenantCfg.commercialName || "Equipo Comercial",
        expiryDate: validUntilStr,
      }),
    );

    const emailResult = await resend.emails.send({
      from: EMAIL_CONFIG.from,
      to: recipientEmail,
      cc: (ccEmails as string[]).filter((e) => e && e.trim()),
      replyTo: EMAIL_CONFIG.replyTo,
      subject: `Propuesta ${bundle.code} - ${companyName}`,
      html: emailHtml,
      attachments: [
        {
          filename: fileName,
          content: pdfBuffer,
          contentType: "application/pdf",
        },
      ],
      tags: [
        { name: "type", value: "cpq-bundle-presentation" },
        { name: "bundle", value: bundle.code },
      ],
    });

    if (emailResult.error) {
      console.error("[bundle send] email:", emailResult.error);
      return NextResponse.json(
        {
          success: false,
          error: "Propuesta marcada como enviada pero falló el correo",
          details: emailResult.error,
        },
        { status: 502 },
      );
    }

    await createCrmHistoryLog({
      tenantId: ctx.tenantId,
      entityType: "bundle",
      entityId: bundleId,
      action: "bundle_sent",
      details: {
        code: bundle.code,
        sentTo: recipientEmail,
        instalaciones: quoteIds.length,
      },
      createdBy: ctx.userId ?? null,
    });

    return NextResponse.json({
      success: true,
      data: {
        bundleId,
        code: bundle.code,
        sentTo: recipientEmail,
        quotesMarkedSent: quoteIds.length,
        emailId: emailResult.data?.id ?? null,
      },
    });
  } catch (error) {
    console.error("[cpq/bundles/send-presentation]", error);
    const msg = error instanceof Error ? error.message : String(error);
    if (msg === "BUNDLE_EMPTY") {
      return NextResponse.json(
        { success: false, error: "No hay cotizaciones incluidas" },
        { status: 400 },
      );
    }
    return NextResponse.json(
      { success: false, error: `Error al enviar propuesta: ${msg}` },
      { status: 500 },
    );
  }
}
