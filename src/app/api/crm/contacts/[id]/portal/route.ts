import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import bcrypt from "bcryptjs";
import { requireAuth, unauthorized } from "@/lib/api-auth";
import { requireCrmEdit } from "@/lib/api-auth-crm";
import { sendNotification } from "@/lib/notification-service";
import { requireTenantModule } from '@/lib/require-module';

function generatePin(): string {
  return String(Math.floor(1000 + Math.random() * 9000));
}

export async function POST(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> },
) {
  try {
    const modCheck = await requireTenantModule('crm');
    if (!modCheck.authorized) return modCheck.response;

    const ctx = await requireAuth();
    if (!ctx) return unauthorized();
    const forbidden = await requireCrmEdit(ctx, "contacts");
    if (forbidden) return forbidden;

    const { id } = await params;
    const body = await request.json();
    const action = body.action as string;

    const contact = await prisma.crmContact.findFirst({
      where: { id, tenantId: ctx.tenantId },
      include: { account: { select: { name: true, status: true, isActive: true } } },
    });

    if (!contact) {
      return NextResponse.json({ success: false, error: "Contacto no encontrado" }, { status: 404 });
    }

    if (action === "generate_pin") {
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

      void sendNotification({
        tenantId: ctx.tenantId,
        type: "portal_cliente_access_granted",
        title: "Acceso al portal del cliente habilitado",
        message: `Se generó PIN de portal para ${contact.firstName} ${contact.lastName} (${contact.account.name})`,
        link: `/crm/accounts/${contact.accountId}?tab=portal`,
      });

      return NextResponse.json({
        success: true,
        data: { pin, portalEnabled: true },
      });
    }

    if (action === "toggle_access") {
      const enabled = body.enabled === true;
      await prisma.crmContact.update({
        where: { id },
        data: { portalEnabled: enabled },
      });

      return NextResponse.json({
        success: true,
        data: { portalEnabled: enabled },
      });
    }

    if (action === "revoke") {
      await prisma.crmContact.update({
        where: { id },
        data: {
          portalPin: null,
          portalPinVisible: null,
          portalEnabled: false,
        },
      });

      void sendNotification({
        tenantId: ctx.tenantId,
        type: "portal_cliente_access_revoked",
        title: "Acceso al portal del cliente revocado",
        message: `Se revocó el acceso al portal de ${contact.firstName} ${contact.lastName} (${contact.account.name})`,
        link: `/crm/accounts/${contact.accountId}?tab=portal`,
      });

      return NextResponse.json({ success: true, data: { portalEnabled: false, pin: null } });
    }

    return NextResponse.json({ success: false, error: "Acción no válida" }, { status: 400 });
  } catch (error) {
    console.error("[CRM] contact portal", error);
    return NextResponse.json({ success: false, error: "Error interno" }, { status: 500 });
  }
}
