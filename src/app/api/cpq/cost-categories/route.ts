/**
 * API Route: /api/cpq/cost-categories
 * GET  - Listar categorías del tenant + globales
 * POST - Crear categoría nueva para el tenant
 */

import { NextRequest, NextResponse } from "next/server";
import { requireAuth, unauthorized } from "@/lib/api-auth";
import { requireCpqView, requireCpqEdit } from "@/lib/api-auth-cpq";
import { prisma } from "@/lib/prisma";
import { requireTenantModule } from '@/lib/require-module';

export async function GET() {
  try {
    const modCheck = await requireTenantModule('cpq');
    if (!modCheck.authorized) return modCheck.response;

    const ctx = await requireAuth();
    if (!ctx) return unauthorized();
    const forbidden = await requireCpqView(ctx);
    if (forbidden) return forbidden;

    const categories = await prisma.cpqCostCategory.findMany({
      where: {
        active: true,
        OR: [{ tenantId: ctx.tenantId }, { tenantId: null }],
      },
      orderBy: [
        { type: "asc" }, // "direct" before "indirect"
        { sortOrder: "asc" },
        { name: "asc" },
      ],
    });

    return NextResponse.json({ success: true, data: categories });
  } catch (error) {
    console.error("Error fetching cost categories:", error);
    return NextResponse.json(
      { success: false, error: "Failed to fetch cost categories" },
      { status: 500 },
    );
  }
}

export async function POST(request: NextRequest) {
  try {
    const modCheck = await requireTenantModule('cpq');
    if (!modCheck.authorized) return modCheck.response;

    const ctx = await requireAuth();
    if (!ctx) return unauthorized();
    const forbidden = await requireCpqEdit(ctx);
    if (forbidden) return forbidden;

    const body = await request.json();
    const name = body?.name?.trim();
    const slug = body?.slug?.trim();

    if (!name || !slug) {
      return NextResponse.json(
        { success: false, error: "name and slug are required" },
        { status: 400 },
      );
    }

    const category = await prisma.cpqCostCategory.create({
      data: {
        tenantId: ctx.tenantId,
        name: String(name).slice(0, 100),
        slug: String(slug).slice(0, 50),
        type: body?.type || "direct",
        icon: body?.icon?.trim() || null,
        sortOrder: body?.sortOrder ?? 0,
        active: true,
      },
    });

    return NextResponse.json({ success: true, data: category }, { status: 201 });
  } catch (error: any) {
    if (error?.code === "P2002") {
      return NextResponse.json(
        { success: false, error: "Ya existe una categoría con ese slug para este tenant" },
        { status: 409 },
      );
    }
    console.error("Error creating cost category:", error);
    return NextResponse.json(
      { success: false, error: "Failed to create cost category" },
      { status: 500 },
    );
  }
}
