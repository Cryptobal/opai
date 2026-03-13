/**
 * API Route: /api/cpq/cargos
 * GET  - Listar cargos CPQ
 * POST - Crear cargo
 */

import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { requireAuth, unauthorized, ensureModuleAccess } from "@/lib/api-auth";

function normalizeColorHex(value: unknown): string | null {
  if (typeof value !== "string") return null;
  const normalized = value.trim().toLowerCase();
  if (!normalized) return null;
  return /^#[0-9a-f]{6}$/.test(normalized) ? normalized : null;
}

export async function GET(request: NextRequest) {
  try {
    const ctx = await requireAuth();
    if (!ctx) return unauthorized();
    const forbiddenMod = await ensureModuleAccess(ctx, "cpq");
    if (forbiddenMod) return forbiddenMod;

    const { searchParams } = new URL(request.url);
    const active = searchParams.get("active");

    const cargos = await prisma.cpqCargo.findMany({
      where: {
        OR: [{ tenantId: ctx.tenantId }, { tenantId: null }],
        ...(active ? { active: active === "true" } : {}),
      },
      orderBy: { name: "asc" },
    });

    return NextResponse.json({ success: true, data: cargos });
  } catch (error) {
    console.error("Error fetching CPQ cargos:", error);
    return NextResponse.json(
      { success: false, error: "Failed to fetch cargos" },
      { status: 500 }
    );
  }
}

export async function POST(request: NextRequest) {
  try {
    const ctx = await requireAuth();
    if (!ctx) return unauthorized();
    const forbiddenMod = await ensureModuleAccess(ctx, "cpq");
    if (forbiddenMod) return forbiddenMod;

    const body = await request.json();
    if (!body.name?.trim()) {
      return NextResponse.json(
        { success: false, error: "Nombre es requerido" },
        { status: 400 }
      );
    }

    const cargo = await prisma.cpqCargo.create({
      data: {
        tenantId: ctx.tenantId,
        name: body.name.trim(),
        description: body.description?.trim() || null,
        colorHex: normalizeColorHex(body.colorHex),
        active: body.active ?? true,
      },
    });

    return NextResponse.json({ success: true, data: cargo }, { status: 201 });
  } catch (error: any) {
    if (error?.code === "P2002") {
      return NextResponse.json(
        { success: false, error: "Ya existe un cargo con ese nombre" },
        { status: 409 }
      );
    }
    console.error("Error creating cargo:", error);
    return NextResponse.json(
      { success: false, error: "Failed to create cargo" },
      { status: 500 }
    );
  }
}
