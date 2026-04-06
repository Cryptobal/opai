/**
 * API Route: /api/crm/industries
 * GET  - Listar industrias (para CRM y formularios públicos)
 * POST - Crear industria (requiere auth)
 */

import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { requireAuth, unauthorized } from "@/lib/api-auth";
import { requireCrmEdit } from "@/lib/api-auth-crm";
import { requireTenantModule } from '@/lib/require-module';

export async function GET(request: NextRequest) {
  try {
    const modCheck = await requireTenantModule('crm');
    if (!modCheck.authorized) return modCheck.response;

    const { searchParams } = new URL(request.url);
    const active = searchParams.get("active");

    const industries = await prisma.crmIndustry.findMany({
      where: active ? { active: active === "true" } : undefined,
      orderBy: [{ order: "asc" }, { name: "asc" }],
    });

    return NextResponse.json({ success: true, data: industries });
  } catch (error) {
    console.error("Error fetching industries:", error);
    return NextResponse.json(
      { success: false, error: "Error al obtener industrias" },
      { status: 500 }
    );
  }
}

export async function POST(request: NextRequest) {
  try {
    const modCheck = await requireTenantModule('crm');
    if (!modCheck.authorized) return modCheck.response;

    const ctx = await requireAuth();
    if (!ctx) return unauthorized();
    const forbidden = await requireCrmEdit(ctx);
    if (forbidden) return forbidden;

    const body = await request.json();
    if (!body.name?.trim()) {
      return NextResponse.json(
        { success: false, error: "El nombre es requerido" },
        { status: 400 }
      );
    }

    const last = await prisma.crmIndustry.findFirst({
      orderBy: { order: "desc" },
      select: { order: true },
    });
    const order = (last?.order ?? 0) + 1;

    const industry = await prisma.crmIndustry.create({
      data: {
        name: body.name.trim(),
        order,
        active: body.active ?? true,
      },
    });

    return NextResponse.json({ success: true, data: industry }, { status: 201 });
  } catch (error: unknown) {
    const e = error as { code?: string };
    if (e?.code === "P2002") {
      return NextResponse.json(
        { success: false, error: "Ya existe una industria con ese nombre" },
        { status: 409 }
      );
    }
    console.error("Error creating industry:", error);
    return NextResponse.json(
      { success: false, error: "Error al crear industria" },
      { status: 500 }
    );
  }
}
