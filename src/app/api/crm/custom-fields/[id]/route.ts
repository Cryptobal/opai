/**
 * API Route: /api/crm/custom-fields/[id]
 * PATCH - Actualiza campo personalizado
 * DELETE - Elimina campo personalizado
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
      return NextResponse.json({ success: false, error: "No autorizado" }, { status: 401 });
    }
    const tenantId = session.user?.tenantId ?? (await getDefaultTenantId());
    const { id } = await params;
    const body = await request.json();

    const field = await prisma.crmCustomField.findFirst({ where: { id, tenantId } });
    if (!field) {
      return NextResponse.json({ success: false, error: "Campo no encontrado" }, { status: 404 });
    }

    const updated = await prisma.crmCustomField.update({
      where: { id },
      data: {
        name: body?.name?.trim() ?? field.name,
        entityType: body?.entityType?.trim() ?? field.entityType,
        type: body?.type?.trim() ?? field.type,
        options: body?.options ?? field.options,
      },
    });

    return NextResponse.json({ success: true, data: updated });
  } catch (error) {
    console.error("Error updating CRM custom field:", error);
    return NextResponse.json(
      { success: false, error: "Failed to update custom field" },
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
      return NextResponse.json({ success: false, error: "No autorizado" }, { status: 401 });
    }
    const tenantId = session.user?.tenantId ?? (await getDefaultTenantId());
    const { id } = await params;

    const field = await prisma.crmCustomField.findFirst({ where: { id, tenantId } });
    if (!field) {
      return NextResponse.json({ success: false, error: "Campo no encontrado" }, { status: 404 });
    }

    await prisma.crmCustomField.delete({ where: { id } });
    return NextResponse.json({ success: true });
  } catch (error) {
    console.error("Error deleting CRM custom field:", error);
    return NextResponse.json(
      { success: false, error: "Failed to delete custom field" },
      { status: 500 }
    );
  }
}
