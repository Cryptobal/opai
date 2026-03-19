/**
 * API Route: /api/cpq/catalog
 * GET  - Listar catálogo CPQ
 * POST - Crear item de catálogo
 */

import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { auth } from "@/lib/auth";
import { getDefaultTenantId } from "@/lib/tenant";

export async function GET(request: NextRequest) {
  try {
    const { searchParams } = new URL(request.url);
    const type = searchParams.get("type");
    const active = searchParams.get("active");
    const session = await auth();
    const tenantId = session?.user?.tenantId ?? (await getDefaultTenantId());

    const items = await prisma.cpqCatalogItem.findMany({
      where: {
        OR: [{ tenantId }, { tenantId: null }],
        ...(type ? { type } : {}),
        ...(active ? { active: active === "true" } : {}),
      },
      orderBy: { name: "asc" },
    });

    const serialized = items.map((item) => ({
      ...item,
      basePrice: Number(item.basePrice),
      defaultTechnicalSpecs: item.defaultTechnicalSpecs ?? null,
    }));
    return NextResponse.json({ success: true, data: serialized });
  } catch (error) {
    console.error("Error fetching CPQ catalog:", error);
    return NextResponse.json(
      { success: false, error: "Failed to fetch catalog" },
      { status: 500 }
    );
  }
}

export async function POST(request: NextRequest) {
  try {
    const session = await auth();
    const tenantId = session?.user?.tenantId ?? (await getDefaultTenantId());
    const body = await request.json();
    const name = body?.name?.trim();
    const type = body?.type?.trim();
    const unit = body?.unit?.trim();

    if (!name || !type || !unit) {
      return NextResponse.json(
        { success: false, error: "Missing required fields" },
        { status: 400 }
      );
    }

    const item = await prisma.cpqCatalogItem.create({
      data: {
        name,
        type,
        unit,
        basePrice: body?.basePrice ?? 0,
        isDefault: body?.isDefault ?? false,
        defaultVisibility: body?.defaultVisibility || "visible",
        active: body?.active ?? true,
        defaultTechnicalSpecs: body?.defaultTechnicalSpecs || null,
        priceLogic: body?.priceLogic || "uniform",
        tenantId,
      },
    });

    return NextResponse.json({ success: true, data: item }, { status: 201 });
  } catch (error) {
    console.error("Error creating CPQ catalog item:", error);
    return NextResponse.json(
      { success: false, error: "Failed to create catalog item" },
      { status: 500 }
    );
  }
}
