/**
 * API Route: /api/cpq/cost-categories/[id]
 * PUT - Modificar categoría (nombre, icon, sortOrder, active)
 */

import { NextRequest, NextResponse } from "next/server";
import { requireAuth, unauthorized } from "@/lib/api-auth";
import { requireCpqEdit } from "@/lib/api-auth-cpq";
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

    const existing = await prisma.cpqCostCategory.findFirst({
      where: { id, OR: [{ tenantId: ctx.tenantId }, { tenantId: null }] },
    });
    if (!existing) {
      return NextResponse.json(
        { success: false, error: "Category not found" },
        { status: 404 },
      );
    }

    const body = await request.json();
    const category = await prisma.cpqCostCategory.update({
      where: { id },
      data: {
        ...(body.name != null && { name: String(body.name).trim().slice(0, 100) }),
        ...(body.icon !== undefined && { icon: body.icon?.trim() || null }),
        ...(body.sortOrder != null && { sortOrder: Number(body.sortOrder) }),
        ...(body.active != null && { active: Boolean(body.active) }),
      },
    });

    return NextResponse.json({ success: true, data: category });
  } catch (error) {
    console.error("Error updating cost category:", error);
    return NextResponse.json(
      { success: false, error: "Failed to update cost category" },
      { status: 500 },
    );
  }
}
