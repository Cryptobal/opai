import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { requireAccessControlAuth } from "@/lib/access-control/auth";

/**
 * Listar contactos del cliente con su flag de "es destinatario activo"
 * de los reportes automáticos de control de acceso.
 */
export async function GET(
  request: NextRequest,
  { params }: { params: Promise<{ installationId: string }> }
) {
  try {
    const { installationId } = await params;
    const authCtx = await requireAccessControlAuth(request, installationId);
    if (!authCtx) {
      return NextResponse.json({ success: false, error: "No autorizado" }, { status: 401 });
    }

    const installation = await prisma.crmInstallation.findUnique({
      where: { id: installationId },
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
        where: { installationId, isActive: true },
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
    console.error("[AccessControl] Error fetching recipients:", error);
    return NextResponse.json(
      { success: false, error: "Error al obtener destinatarios" },
      { status: 500 }
    );
  }
}

/**
 * Activar o desactivar un contacto como destinatario.
 * Body: { contactId: string, isRecipient: boolean }
 */
export async function POST(
  request: NextRequest,
  { params }: { params: Promise<{ installationId: string }> }
) {
  try {
    const { installationId } = await params;
    const authCtx = await requireAccessControlAuth(request, installationId);
    if (!authCtx) {
      return NextResponse.json({ success: false, error: "No autorizado" }, { status: 401 });
    }

    const body = await request.json();
    const { contactId, isRecipient } = body as { contactId: string; isRecipient: boolean };
    if (!contactId) {
      return NextResponse.json(
        { success: false, error: "contactId requerido" },
        { status: 400 }
      );
    }

    const installation = await prisma.crmInstallation.findUnique({
      where: { id: installationId },
      select: { tenantId: true },
    });
    if (!installation) {
      return NextResponse.json(
        { success: false, error: "Instalación no encontrada" },
        { status: 404 }
      );
    }

    const contact = await prisma.crmContact.findFirst({
      where: { id: contactId, tenantId: installation.tenantId },
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
        where: { installationId, contactId },
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
        where: { installationId, contactId },
        data: { isActive: false },
      });
    }

    return NextResponse.json({ success: true });
  } catch (error) {
    console.error("[AccessControl] Error updating recipient:", error);
    return NextResponse.json(
      { success: false, error: "Error al actualizar destinatario" },
      { status: 500 }
    );
  }
}
