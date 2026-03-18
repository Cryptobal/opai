/**
 * API Route: /api/cpq/puestos
 * GET  - Listar puestos de trabajo CPQ
 * POST - Crear puesto de trabajo
 */

import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { requireAuth, unauthorized } from "@/lib/api-auth";
import { requireCpqView, requireCpqEdit } from "@/lib/api-auth-cpq";

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
    const forbidden = await requireCpqView(ctx);
    if (forbidden) return forbidden;

    const { searchParams } = new URL(request.url);
    const active = searchParams.get("active");

    const puestos = await prisma.cpqPuestoTrabajo.findMany({
      where: {
        OR: [{ tenantId: ctx.tenantId }, { tenantId: null }],
        ...(active ? { active: active === "true" } : {}),
      },
      orderBy: { name: "asc" },
    });

    return NextResponse.json({ success: true, data: puestos });
  } catch (error) {
    console.error("Error fetching CPQ puestos:", error);
    return NextResponse.json(
      { success: false, error: "Failed to fetch puestos" },
      { status: 500 }
    );
  }
}

export async function POST(request: NextRequest) {
  try {
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

    const puesto = await prisma.cpqPuestoTrabajo.create({
      data: {
        tenantId: ctx.tenantId,
        name: body.name.trim(),
        colorHex: normalizeColorHex(body.colorHex),
        active: body.active ?? true,
      },
    });

    return NextResponse.json({ success: true, data: puesto }, { status: 201 });
  } catch (error: any) {
    if (error?.code === "P2002") {
      return NextResponse.json(
        { success: false, error: "Ya existe un puesto con ese nombre" },
        { status: 409 }
      );
    }
    console.error("Error creating puesto:", error);
    return NextResponse.json(
      { success: false, error: "Failed to create puesto" },
      { status: 500 }
    );
  }
}
