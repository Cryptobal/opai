/**
 * API Route: /api/cpq/roles
 * GET  - Listar roles CPQ
 * POST - Crear rol
 */

import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { requireAuth, unauthorized } from "@/lib/api-auth";
import { requireCpqView, requireCpqEdit } from "@/lib/api-auth-cpq";
import { requireTenantModule } from '@/lib/require-module';

function normalizeColorHex(value: unknown): string | null {
  if (typeof value !== "string") return null;
  const normalized = value.trim().toLowerCase();
  if (!normalized) return null;
  return /^#[0-9a-f]{6}$/.test(normalized) ? normalized : null;
}

export async function GET(request: NextRequest) {
  try {
    const modCheck = await requireTenantModule('cpq');
    if (!modCheck.authorized) return modCheck.response;

    const ctx = await requireAuth();
    if (!ctx) return unauthorized();
    const forbidden = await requireCpqView(ctx);
    if (forbidden) return forbidden;

    const { searchParams } = new URL(request.url);
    const active = searchParams.get("active");

    const roles = await prisma.cpqRol.findMany({
      where: {
        OR: [{ tenantId: ctx.tenantId }, { tenantId: null }],
        ...(active ? { active: active === "true" } : {}),
      },
      orderBy: { name: "asc" },
    });

    return NextResponse.json({ success: true, data: roles });
  } catch (error) {
    console.error("Error fetching CPQ roles:", error);
    return NextResponse.json(
      { success: false, error: "Failed to fetch roles" },
      { status: 500 }
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
    if (!body.name?.trim()) {
      return NextResponse.json(
        { success: false, error: "Nombre es requerido" },
        { status: 400 }
      );
    }

    const patternWork = typeof body.patternWork === "number" ? body.patternWork : null;
    const patternOff = typeof body.patternOff === "number" ? body.patternOff : null;
    const salary =
      typeof body.salary === "number" && body.salary > 0 ? Math.round(body.salary) : 0;

    const rol = await prisma.cpqRol.create({
      data: {
        tenantId: ctx.tenantId,
        name: body.name.trim(),
        description: body.description?.trim() || null,
        colorHex: normalizeColorHex(body.colorHex),
        patternWork,
        patternOff,
        salary,
        active: body.active ?? true,
      },
    });

    return NextResponse.json({ success: true, data: rol }, { status: 201 });
  } catch (error: any) {
    if (error?.code === "P2002") {
      return NextResponse.json(
        { success: false, error: "Ya existe un rol con ese nombre" },
        { status: 409 }
      );
    }
    console.error("Error creating rol:", error);
    return NextResponse.json(
      { success: false, error: "Failed to create rol" },
      { status: 500 }
    );
  }
}
