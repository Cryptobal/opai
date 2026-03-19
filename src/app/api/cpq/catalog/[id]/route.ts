/**
 * API Route: /api/cpq/catalog/[id]
 * PATCH  - Actualizar item de catálogo
 * DELETE - Desactivar item de catálogo
 */

import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { auth } from "@/lib/auth";
import { getDefaultTenantId } from "@/lib/tenant";

export async function PATCH(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const { id } = await params;
    const body = await request.json();
    const session = await auth();
    const tenantId = session?.user?.tenantId ?? (await getDefaultTenantId());

    const data: any = {};
    if (body?.name !== undefined) data.name = body.name?.trim();
    if (body?.type !== undefined) data.type = body.type?.trim();
    if (body?.unit !== undefined) data.unit = body.unit?.trim();
    if (body?.basePrice !== undefined) data.basePrice = body.basePrice;
    if (body?.isDefault !== undefined) data.isDefault = body.isDefault;
    if (body?.defaultVisibility !== undefined)
      data.defaultVisibility = body.defaultVisibility;
    if (body?.active !== undefined) data.active = body.active;
    if (body?.defaultTechnicalSpecs !== undefined) data.defaultTechnicalSpecs = body.defaultTechnicalSpecs;
    if (body?.priceLogic !== undefined) data.priceLogic = body.priceLogic;

    const existing = await prisma.cpqCatalogItem.findFirst({
      where: {
        id,
        OR: [{ tenantId }, { tenantId: null }],
      },
    });

    if (!existing) {
      return NextResponse.json(
        { success: false, error: "Catalog item not found" },
        { status: 404 }
      );
    }

    const item = await prisma.cpqCatalogItem.update({
      where: { id: existing.id },
      data,
    });

    return NextResponse.json({ success: true, data: item });
  } catch (error) {
    console.error("Error updating CPQ catalog item:", error);
    return NextResponse.json(
      { success: false, error: "Failed to update catalog item" },
      { status: 500 }
    );
  }
}

export async function DELETE(
  _request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const { id } = await params;
    const session = await auth();
    const tenantId = session?.user?.tenantId ?? (await getDefaultTenantId());

    const existing = await prisma.cpqCatalogItem.findFirst({
      where: {
        id,
        OR: [{ tenantId }, { tenantId: null }],
      },
    });

    if (!existing) {
      return NextResponse.json(
        { success: false, error: "Catalog item not found" },
        { status: 404 }
      );
    }

    const item = await prisma.cpqCatalogItem.update({
      where: { id: existing.id },
      data: { active: false },
    });

    return NextResponse.json({ success: true, data: item });
  } catch (error) {
    console.error("Error deleting CPQ catalog item:", error);
    return NextResponse.json(
      { success: false, error: "Failed to delete catalog item" },
      { status: 500 }
    );
  }
}
