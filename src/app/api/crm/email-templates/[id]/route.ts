/**
 * API Route: /api/crm/email-templates/[id]
 * PATCH - Actualizar template
 * DELETE - Eliminar template
 */

import { NextRequest, NextResponse } from "next/server";
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

    // Verify ownership BEFORE updating
    const existing = await prisma.crmEmailTemplate.findFirst({
      where: { id, tenantId: ctx.tenantId },
    });

    if (!existing) {
      return NextResponse.json(
        { success: false, error: "Template no encontrado" },
        { status: 404 }
      );
    }

    const result = await prisma.crmEmailTemplate.updateMany({
      where: { id, tenantId: ctx.tenantId },
      data: {
        name: body?.name?.trim() ?? existing.name,
        subject: body?.subject?.trim() ?? existing.subject,
        body: body?.body?.trim() ?? existing.body,
        scope: body?.scope?.trim() ?? existing.scope,
        stageId: body?.stageId ?? existing.stageId,
      },
    });
    if (result.count === 0) {
      return NextResponse.json(
        { success: false, error: "Template no encontrado" },
        { status: 404 }
      );
    }
    const template = await prisma.crmEmailTemplate.findFirst({
      where: { id, tenantId: ctx.tenantId },
    })!;

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
    const ctx = await requireAuth();
    if (!ctx) return unauthorized();
    const forbidden = await requireCrmDelete(ctx);
    if (forbidden) return forbidden;

    const { id } = await params;

    const template = await prisma.crmEmailTemplate.findFirst({
      where: { id, tenantId: ctx.tenantId },
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
