/**
 * API Route: /api/crm/email-templates/[id]
 * PATCH - Actualizar template
 * DELETE - Eliminar template
 */

import { NextRequest, NextResponse } from "next/server";
import { auth } from "@/lib/auth";
import { prisma } from "@/lib/prisma";
import { getDefaultTenantId } from "@/lib/tenant";

export async function PATCH(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const session = await auth();
    if (!session?.user) {
      return NextResponse.json(
        { success: false, error: "No autorizado" },
        { status: 401 }
      );
    }
    const tenantId = session.user?.tenantId ?? (await getDefaultTenantId());
    const { id } = await params;
    const body = await request.json();

    const template = await prisma.crmEmailTemplate.update({
      where: { id },
      data: {
        name: body?.name?.trim(),
        subject: body?.subject?.trim(),
        body: body?.body?.trim(),
        scope: body?.scope?.trim(),
        stageId: body?.stageId || null,
      },
    });

    if (template.tenantId !== tenantId) {
      return NextResponse.json(
        { success: false, error: "No autorizado" },
        { status: 403 }
      );
    }

    return NextResponse.json({ success: true, data: template });
  } catch (error) {
    console.error("Error updating CRM email template:", error);
    return NextResponse.json(
      { success: false, error: "Failed to update template" },
      { status: 500 }
    );
  }
}

export async function DELETE(
  _request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const session = await auth();
    if (!session?.user) {
      return NextResponse.json(
        { success: false, error: "No autorizado" },
        { status: 401 }
      );
    }
    const tenantId = session.user?.tenantId ?? (await getDefaultTenantId());
    const { id } = await params;

    const template = await prisma.crmEmailTemplate.findFirst({
      where: { id, tenantId },
    });

    if (!template) {
      return NextResponse.json(
        { success: false, error: "Template no encontrado" },
        { status: 404 }
      );
    }

    await prisma.crmEmailTemplate.delete({ where: { id } });

    return NextResponse.json({ success: true });
  } catch (error) {
    console.error("Error deleting CRM email template:", error);
    return NextResponse.json(
      { success: false, error: "Failed to delete template" },
      { status: 500 }
    );
  }
}
