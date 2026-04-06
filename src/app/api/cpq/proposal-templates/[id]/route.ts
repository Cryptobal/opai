/**
 * API Route: /api/cpq/proposal-templates/[id]
 * PUT    - Modificar template (solo si es del tenant)
 * DELETE - Soft delete (active = false)
 */

import { NextRequest, NextResponse } from "next/server";
import { requireAuth, unauthorized } from "@/lib/api-auth";
import { requireCpqEdit, requireCpqDelete } from "@/lib/api-auth-cpq";
import { prisma } from "@/lib/prisma";
import { requireTenantModule } from '@/lib/require-module';

export async function PUT(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> },
) {
  try {
    const modCheck = await requireTenantModule('cpq');
    if (!modCheck.authorized) return modCheck.response;

    const ctx = await requireAuth();
    if (!ctx) return unauthorized();
    const forbidden = await requireCpqEdit(ctx);
    if (forbidden) return forbidden;

    const { id } = await params;

    const existing = await prisma.cpqProposalTemplate.findFirst({
      where: { id, tenantId: ctx.tenantId },
    });
    if (!existing) {
      return NextResponse.json(
        { success: false, error: "Template not found or is a global template" },
        { status: 404 },
      );
    }

    const body = await request.json();
    const template = await prisma.cpqProposalTemplate.update({
      where: { id },
      data: {
        ...(body.name != null && { name: String(body.name).trim().slice(0, 100) }),
        ...(body.slug != null && { slug: String(body.slug).trim().slice(0, 50) }),
        ...(body.description !== undefined && { description: body.description?.trim() || null }),
        ...(body.sections != null && { sections: body.sections }),
        ...(body.isDefault != null && { isDefault: Boolean(body.isDefault) }),
        ...(body.active != null && { active: Boolean(body.active) }),
      },
    });

    return NextResponse.json({ success: true, data: template });
  } catch (error: any) {
    if (error?.code === "P2002") {
      return NextResponse.json(
        { success: false, error: "Ya existe un template con ese slug para este tenant" },
        { status: 409 },
      );
    }
    console.error("Error updating proposal template:", error);
    return NextResponse.json(
      { success: false, error: "Failed to update template" },
      { status: 500 },
    );
  }
}

export async function DELETE(
  _request: NextRequest,
  { params }: { params: Promise<{ id: string }> },
) {
  try {
    const modCheck = await requireTenantModule('cpq');
    if (!modCheck.authorized) return modCheck.response;

    const ctx = await requireAuth();
    if (!ctx) return unauthorized();
    const forbidden = await requireCpqDelete(ctx);
    if (forbidden) return forbidden;

    const { id } = await params;

    const existing = await prisma.cpqProposalTemplate.findFirst({
      where: { id, tenantId: ctx.tenantId },
    });
    if (!existing) {
      return NextResponse.json(
        { success: false, error: "Template not found or is a global template" },
        { status: 404 },
      );
    }

    await prisma.cpqProposalTemplate.update({
      where: { id },
      data: { active: false },
    });

    return NextResponse.json({ success: true });
  } catch (error) {
    console.error("Error deleting proposal template:", error);
    return NextResponse.json(
      { success: false, error: "Failed to delete template" },
      { status: 500 },
    );
  }
}
