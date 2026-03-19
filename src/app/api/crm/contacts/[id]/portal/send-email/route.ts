import { NextRequest, NextResponse } from "next/server";
import { render } from "@react-email/render";
import { prisma } from "@/lib/prisma";
import { requireAuth, unauthorized } from "@/lib/api-auth";
import { requireCrmEdit } from "@/lib/api-auth-crm";
import { resend, getTenantEmailConfig } from "@/lib/resend";
import { PortalClienteInviteEmail } from "@/emails/PortalClienteInviteEmail";

export async function POST(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> },
) {
  try {
    const ctx = await requireAuth();
    if (!ctx) return unauthorized();
    const forbidden = await requireCrmEdit(ctx, "contacts");
    if (forbidden) return forbidden;

    const { id } = await params;
    const contact = await prisma.crmContact.findFirst({
      where: { id, tenantId: ctx.tenantId },
      include: { account: { select: { name: true } } },
    });

    if (!contact) {
      return NextResponse.json({ success: false, error: "Contacto no encontrado" }, { status: 404 });
    }

    if (!contact.email) {
      return NextResponse.json({ success: false, error: "El contacto no tiene email" }, { status: 400 });
    }

    if (!contact.portalEnabled || !contact.portalPinVisible) {
      return NextResponse.json({ success: false, error: "El portal no está habilitado o no tiene PIN" }, { status: 400 });
    }

    const portalUrl = `${process.env.NEXT_PUBLIC_APP_URL || "https://opai.gard.cl"}/portal/cliente`;
    const ejecutivo = await prisma.admin.findUnique({
      where: { id: ctx.userId },
      select: { name: true },
    });
    const ejecutivoName = ejecutivo?.name || "tu ejecutivo";

    const contactName = `${contact.firstName} ${contact.lastName}`.trim() || contact.firstName || "Cliente";
    const html = await render(
      PortalClienteInviteEmail({
        contactName,
        companyName: contact.account.name,
        email: contact.email,
        pin: contact.portalPinVisible,
        portalUrl,
        ejecutivoName,
      })
    );

    const emailConfig = await getTenantEmailConfig(ctx.tenantId);

    const emailResult = await resend.emails.send({
      from: emailConfig.from,
      replyTo: emailConfig.replyTo,
      to: contact.email,
      subject: `Acceso al Portal de Seguridad — ${contact.account.name}`,
      html,
    });

    if (emailResult.error) {
      const msg = emailResult.error.message || "Resend rechazó el envío";
      console.error("[CRM] contact portal send-email Resend error:", emailResult.error);
      return NextResponse.json(
        {
          success: false,
          error: process.env.NODE_ENV === "development" ? msg : "Error enviando email. Verifica RESEND_API_KEY y que el dominio esté verificado en Resend.",
        },
        { status: 500 },
      );
    }

    try {
      await prisma.crmContact.update({
        where: { id },
        data: { portalInvitationSentAt: new Date() },
      });
    } catch (e) {
      console.error("[CRM] contact portal send-email: email enviado pero falló actualizar portalInvitationSentAt:", e);
    }

    return NextResponse.json({ success: true });
  } catch (error) {
    console.error("[CRM] contact portal send-email", error);
    const errMsg = error instanceof Error ? error.message : "Error desconocido";
    return NextResponse.json(
      {
        success: false,
        error: process.env.NODE_ENV === "development" ? errMsg : "Error enviando email",
      },
      { status: 500 },
    );
  }
}
