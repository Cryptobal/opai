/**
 * API Route: /api/crm/custom-fields/[id]
 * PATCH - Actualiza campo personalizado
 * DELETE - Elimina campo personalizado
 */

import { NextRequest, NextResponse } from "next/server";
import { Prisma } from "@prisma/client";
import { prisma } from "@/lib/prisma";
import { requireAuth, unauthorized } from "@/lib/api-auth";
import { requireCrmEdit, requireCrmDelete } from "@/lib/api-auth-crm";

export async function PATCH(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const ctx = await requireAuth();
    if (!ctx) return unauthorized();
    const forbidden = await requireCrmEdit(ctx);
    if (forbidden) return forbidden;

    const { id } = await params;
    const body = await request.json();

    const field = await prisma.crmCustomField.findFirst({ where: { id, tenantId: ctx.tenantId } });
    if (!field) {
      return NextResponse.json({ success: false, error: "Campo no encontrado" }, { status: 404 });
    }

    const newType = body?.type?.trim() ?? field.type;
    const data: Prisma.CrmCustomFieldUpdateInput = {
      name: body?.name?.trim() ?? field.name,
      entityType: body?.entityType?.trim() ?? field.entityType,
      type: newType,
    };

    if ("options" in body) {
      if (body.options === null) {
        data.options = Prisma.DbNull;
      } else {
        data.options = body.options;
      }
    }

    const result = await prisma.crmCustomField.updateMany({
      where: { id, tenantId: ctx.tenantId },
      data,
    });
    if (result.count === 0) {
      return NextResponse.json({ success: false, error: "Campo no encontrado" }, { status: 404 });
    }
    const updated = await prisma.crmCustomField.findFirst({
      where: { id, tenantId: ctx.tenantId },
    })!;

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
    const ctx = await requireAuth();
    if (!ctx) return unauthorized();
    const forbidden = await requireCrmDelete(ctx);
    if (forbidden) return forbidden;

    const { id } = await params;

    const field = await prisma.crmCustomField.findFirst({ where: { id, tenantId: ctx.tenantId } });
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
