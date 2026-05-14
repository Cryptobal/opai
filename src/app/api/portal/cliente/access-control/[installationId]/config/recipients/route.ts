import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { ensureInstallationAccess, requirePortalClienteAuth } from "@/lib/portal-cliente";

/**
 * Espejo del endpoint admin /api/access-control/config/[installationId]/recipients.
 * Permite al cliente listar y modificar los destinatarios del reporte automático
 * para su propia instalación.
 */

async function authorize(request: NextRequest, installationId: string) {
  const session = await requirePortalClienteAuth(request);
  if (!session) {
    return { error: NextResponse.json({ success: false, error: "No autorizado" }, { status: 401 }), session: null };
  }
  if (!(await ensureInstallationAccess(session, installationId))) {
    return { error: NextResponse.json({ success: false, error: "Acceso denegado" }, { status: 403 }), session: null };
  }
  return { error: null, session };
}

export async function GET(
  request: NextRequest,
  { params }: { params: Promise<{ installationId: string }> }
) {
  try {
    const { installationId } = await params;
    const { error, session } = await authorize(request, installationId);
    if (error) return error;

    const installation = await prisma.crmInstallation.findFirst({
      where: { id: installationId, tenantId: session!.tenantId },
      select: { tenantId: true, accountId: true },
    });
    if (!installation?.accountId) {
      return NextResponse.json({ success: true, data: [] });
    }

    const [contacts, activeRecipients] = await Promise.all([
      prisma.crmContact.findMany({
        where: {
          tenantId: installation.tenantId,
          accountId: installation.accountId,
          email: { not: null },
        },
        select: {
          id: true,
          firstName: true,
          lastName: true,
          email: true,
          roleTitle: true,
          isPrimary: true,
        },
      }),
      prisma.accessControlReportRecipient.findMany({
        where: { installationId, tenantId: session!.tenantId, isActive: true },
        select: { id: true, contactId: true, email: true },
      }),
    ]);

    const activeContactIds = new Set(
      activeRecipients.map((r) => r.contactId).filter(Boolean) as string[]
    );

    const data = contacts.map((c) => ({
      contactId: c.id,
      name: `${c.firstName} ${c.lastName}`.trim(),
      email: c.email!,
      roleTitle: c.roleTitle,
      isPrimary: c.isPrimary,
      isRecipient: activeContactIds.has(c.id),
    }));

    return NextResponse.json({ success: true, data });
  } catch (error) {
    console.error("[PortalCliente/AccessControl] Error fetching recipients:", error);
    return NextResponse.json(
      { success: false, error: "Error al obtener destinatarios" },
      { status: 500 }
    );
  }
}

export async function POST(
  request: NextRequest,
  { params }: { params: Promise<{ installationId: string }> }
) {
  try {
    const { installationId } = await params;
    const { error, session } = await authorize(request, installationId);
    if (error) return error;

    const body = await request.json();
    const { contactId, isRecipient } = body as { contactId: string; isRecipient: boolean };
    if (!contactId) {
      return NextResponse.json(
        { success: false, error: "contactId requerido" },
        { status: 400 }
      );
    }

    const installation = await prisma.crmInstallation.findFirst({
      where: { id: installationId, tenantId: session!.tenantId, accountId: session!.accountId },
      select: { tenantId: true, accountId: true },
    });
    if (!installation || !installation.accountId) {
      return NextResponse.json(
        { success: false, error: "Instalación no encontrada" },
        { status: 404 }
      );
    }

    const contact = await prisma.crmContact.findFirst({
      where: {
        id: contactId,
        tenantId: installation.tenantId,
        accountId: installation.accountId,
      },
      select: { id: true, firstName: true, lastName: true, email: true },
    });
    if (!contact || !contact.email) {
      return NextResponse.json(
        { success: false, error: "Contacto no encontrado o sin email" },
        { status: 404 }
      );
    }

    if (isRecipient) {
      const existing = await prisma.accessControlReportRecipient.findFirst({
        where: { installationId, contactId, tenantId: session!.tenantId },
      });
      if (existing) {
        await prisma.accessControlReportRecipient.update({
          where: { id: existing.id },
          data: { isActive: true, email: contact.email },
        });
      } else {
        await prisma.accessControlReportRecipient.create({
          data: {
            tenantId: installation.tenantId,
            installationId,
            contactId,
            email: contact.email,
            name: `${contact.firstName} ${contact.lastName}`.trim(),
            isActive: true,
          },
        });
      }
    } else {
      await prisma.accessControlReportRecipient.updateMany({
        where: { installationId, contactId, tenantId: session!.tenantId },
        data: { isActive: false },
      });
    }

    return NextResponse.json({ success: true });
  } catch (error) {
    console.error("[PortalCliente/AccessControl] Error updating recipient:", error);
    return NextResponse.json(
      { success: false, error: "Error al actualizar destinatario" },
      { status: 500 }
    );
  }
}
