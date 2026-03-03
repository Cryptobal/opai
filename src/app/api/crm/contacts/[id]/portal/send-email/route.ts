import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { requireAuth, unauthorized, resolveApiPerms } from "@/lib/api-auth";
import { canEdit } from "@/lib/permissions";
import { resend, EMAIL_CONFIG } from "@/lib/resend";

export async function POST(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> },
) {
  try {
    const ctx = await requireAuth();
    if (!ctx) return unauthorized();
    const perms = await resolveApiPerms(ctx);
    if (!canEdit(perms, "crm", "accounts")) {
      return NextResponse.json({ success: false, error: "Sin permisos" }, { status: 403 });
    }

    const { id } = await params;
    const contact = await prisma.crmContact.findFirst({
      where: { id, tenantId: ctx.tenantId },
      include: { account: { select: { name: true, rut: true } } },
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

    await resend.emails.send({
      from: EMAIL_CONFIG.from,
      to: contact.email,
      subject: `Acceso al Portal de Seguridad — ${contact.account.name}`,
      html: `
        <div style="font-family: system-ui, sans-serif; max-width: 500px; margin: 0 auto; padding: 32px; background: #0f172a; color: #e2e8f0; border-radius: 12px;">
          <div style="text-align: center; margin-bottom: 24px;">
            <h2 style="color: #14b8a6; margin: 0;">🛡️ Portal de Seguridad</h2>
            <p style="color: #94a3b8; font-size: 14px;">Gard Security</p>
          </div>
          <p>Hola <strong>${contact.firstName}</strong>,</p>
          <p>Se ha habilitado tu acceso al Portal de Seguridad para <strong>${contact.account.name}</strong>.</p>
          <div style="background: #1e293b; border-radius: 8px; padding: 16px; margin: 16px 0; text-align: center;">
            <p style="margin: 0 0 4px; font-size: 12px; color: #94a3b8;">RUT de empresa</p>
            <p style="margin: 0 0 12px; font-size: 18px; font-weight: bold;">${contact.account.rut ?? "—"}</p>
            <p style="margin: 0 0 4px; font-size: 12px; color: #94a3b8;">PIN de acceso</p>
            <p style="margin: 0; font-size: 24px; font-weight: bold; letter-spacing: 0.2em; color: #14b8a6;">${contact.portalPinVisible}</p>
          </div>
          <div style="text-align: center; margin: 20px 0;">
            <a href="${portalUrl}" style="display: inline-block; background: #14b8a6; color: white; padding: 12px 32px; border-radius: 8px; text-decoration: none; font-weight: 600;">
              Acceder al Portal
            </a>
          </div>
          <p style="font-size: 12px; color: #64748b; text-align: center; margin-top: 24px;">
            Este enlace es confidencial. No lo comparta con personas ajenas a su organización.
          </p>
        </div>
      `,
    });

    return NextResponse.json({ success: true });
  } catch (error) {
    console.error("[CRM] contact portal send-email", error);
    return NextResponse.json({ success: false, error: "Error enviando email" }, { status: 500 });
  }
}
