import { NextRequest, NextResponse } from "next/server";
import { render } from "@react-email/render";
import bcrypt from "bcryptjs";
import { prisma } from "@/lib/prisma";
import { requireAuth, unauthorized } from "@/lib/api-auth";
import { requireCrmEdit } from "@/lib/api-auth-crm";
import { requireTenantModule } from "@/lib/require-module";
import { resend, getTenantEmailConfig } from "@/lib/resend";
import { CompanyPresentationEmail } from "@/emails/CompanyPresentationEmail";
import { notify } from "@/lib/notifications/notify";
import { buildEmailUrl } from "@/lib/emails/site-url";
import { getTenantCompanyConfig } from "@/lib/tenant-config";

function generatePin(): string {
  return String(Math.floor(1000 + Math.random() * 9000));
}

export async function POST(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> },
) {
  try {
    const modCheck = await requireTenantModule("crm");
    if (!modCheck.authorized) return modCheck.response;

    const ctx = await requireAuth();
    if (!ctx) return unauthorized();
    const forbidden = await requireCrmEdit(ctx, "contacts");
    if (forbidden) return forbidden;

    const { id } = await params;
    const body = await request.json().catch(() => ({}));
    const notes = typeof body.notes === "string" ? body.notes.trim() || undefined : undefined;
    const installationId = typeof body.installationId === "string" ? body.installationId.trim() || undefined : undefined;

    const contact = await prisma.crmContact.findFirst({
      where: { id, tenantId: ctx.tenantId },
      include: { account: { select: { name: true } } },
    });

    if (!contact) {
      return NextResponse.json({ success: false, error: "Contacto no encontrado" }, { status: 404 });
    }

    if (!contact.email?.trim()) {
      return NextResponse.json({ success: false, error: "El contacto no tiene email" }, { status: 400 });
    }

    if (installationId) {
      const okInst = await prisma.crmInstallation.findFirst({
        where: {
          id: installationId,
          tenantId: ctx.tenantId,
          accountId: contact.accountId,
        },
        select: { id: true },
      });
      if (!okInst) {
        return NextResponse.json(
          { success: false, error: "La instalación no pertenece a esta cuenta." },
          { status: 400 },
        );
      }
    }

    let portalPinPlain = contact.portalPinVisible ?? null;

    if (!contact.portalEnabled || !portalPinPlain) {
      const pin = generatePin();
      const hashedPin = await bcrypt.hash(pin, 10);

      await prisma.crmContact.update({
        where: { id },
        data: {
          portalPin: hashedPin,
          portalPinVisible: pin,
          portalEnabled: true,
        },
      });
      portalPinPlain = pin;

      void notify({
        tenantId: ctx.tenantId,
        type: "portal_cliente_access_granted",
        audience: "admin",
        title: "Portal del cliente habilitado para presentación",
        body: `Se envió presentación institucional a ${contact.firstName} ${contact.lastName} (${contact.account.name}) — PIN regenerado.`,
        link: `/crm/accounts/${contact.accountId}?tab=portal`,
      });
    }

    const tenantRow = await prisma.tenant.findUnique({
      where: { id: ctx.tenantId },
      select: { slug: true },
    });

    const portalUrl = buildEmailUrl("/portal/cliente", tenantRow?.slug ?? null);
    const tenantCfg = await getTenantCompanyConfig(ctx.tenantId);
    const ejecutivo = await prisma.admin.findUnique({
      where: { id: ctx.userId },
      select: { name: true },
    });
    const ejecutivoName = ejecutivo?.name || "Ejecutivo comercial";

    const contactFullName =
      `${contact.firstName} ${contact.lastName}`.trim() || contact.firstName || "Cliente";

    const html = await render(
      CompanyPresentationEmail({
        contactName: contactFullName,
        companyName: contact.account.name,
        email: contact.email,
        pin: portalPinPlain ?? undefined,
        portalUrl,
        ejecutivoName,
        notes,
        brandName: tenantCfg.commercialName,
        logoUrl: tenantCfg.logoUrl || tenantCfg.brandingLogoWhite || "",
      }),
    );

    const emailCfg = await getTenantEmailConfig(ctx.tenantId);
    const emailResult = await resend.emails.send({
      from: emailCfg.from,
      replyTo: emailCfg.replyTo,
      to: contact.email.trim(),
      subject: `Presentación institucional — ${tenantCfg.commercialName} · ${contact.account.name}`,
      html,
    });

    if (emailResult.error) {
      const msg = emailResult.error.message || "Resend rechazó el envío";
      console.error("[CRM] send-presentation Resend:", emailResult.error);
      return NextResponse.json(
        {
          success: false,
          error: process.env.NODE_ENV === "development" ? msg : "Error enviando email. Verifica configuración.",
        },
        { status: 500 },
      );
    }

    const existingPresentation = await prisma.crmCompanyPresentation.findFirst({
      where: {
        contactId: id,
        tenantId: ctx.tenantId,
        status: { in: ["sent", "viewed"] },
      },
    });

    const now = new Date();
    if (existingPresentation) {
      await prisma.crmCompanyPresentation.update({
        where: { id: existingPresentation.id },
        data: {
          sentAt: now,
          sentById: ctx.userId,
        },
      });
    } else {
      await prisma.crmCompanyPresentation.create({
        data: {
          tenantId: ctx.tenantId,
          contactId: id,
          sentById: ctx.userId,
          status: "sent",
          sentAt: now,
        },
      });
    }

    try {
      await prisma.crmContact.update({
        where: { id },
        data: { portalInvitationSentAt: now },
      });
    } catch (e) {
      console.warn("[CRM] send-presentation: sesión fecha invitacion no actualizada", e);
    }

    return NextResponse.json({ success: true });
  } catch (error) {
    console.error("[CRM] send-presentation:", error);
    const errMsg = error instanceof Error ? error.message : "Error desconocido";
    return NextResponse.json(
      {
        success: false,
        error: process.env.NODE_ENV === "development" ? errMsg : "Error interno enviando presentación",
      },
      { status: 500 },
    );
  }
}
