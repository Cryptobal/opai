/**
 * API Route: /api/crm/industries/[id]
 * PUT    - Actualizar industria
 * DELETE - Desactivar industria
 */

import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { requireAuth, unauthorized } from "@/lib/api-auth";
import { requireCrmEdit, requireCrmDelete } from "@/lib/api-auth-crm";
import { requireTenantModule } from '@/lib/require-module';

type Params = { params: Promise<{ id: string }> };

export async function PUT(request: NextRequest, { params }: Params) {
  try {
    const modCheck = await requireTenantModule('crm');
    if (!modCheck.authorized) return modCheck.response;

    const ctx = await requireAuth();
    if (!ctx) return unauthorized();
    const forbidden = await requireCrmEdit(ctx);
    if (forbidden) return forbidden;

    const { id } = await params;
    const body = await request.json();

    if (!body.name?.trim()) {
      return NextResponse.json(
        { success: false, error: "El nombre es requerido" },
        { status: 400 }
      );
    }

    const industry = await prisma.crmIndustry.update({
      where: { id },
      data: {
        name: body.name.trim(),
        order: typeof body.order === "number" ? body.order : undefined,
        active: body.active ?? true,
      },
    });

    return NextResponse.json({ success: true, data: industry });
  } catch (error: unknown) {
    const e = error as { code?: string };
    if (e?.code === "P2025") {
      return NextResponse.json(
        { success: false, error: "Industria no encontrada" },
        { status: 404 }
      );
    }
    if (e?.code === "P2002") {
      return NextResponse.json(
        { success: false, error: "Ya existe una industria con ese nombre" },
        { status: 409 }
      );
    }
    console.error("Error updating industry:", error);
    return NextResponse.json(
      { success: false, error: "Error al actualizar industria" },
      { status: 500 }
    );
  }
}

export async function DELETE(request: NextRequest, { params }: Params) {
  try {
    const modCheck = await requireTenantModule('crm');
    if (!modCheck.authorized) return modCheck.response;

    const ctx = await requireAuth();
    if (!ctx) return unauthorized();
    const forbidden = await requireCrmDelete(ctx);
    if (forbidden) return forbidden;

    const { id } = await params;

    await prisma.crmIndustry.update({
      where: { id },
      data: { active: false },
    });

    return NextResponse.json({ success: true });
  } catch (error: unknown) {
    const e = error as { code?: string };
    if (e?.code === "P2025") {
      return NextResponse.json(
        { success: false, error: "Industria no encontrada" },
        { status: 404 }
      );
    }
    console.error("Error deactivating industry:", error);
    return NextResponse.json(
      { success: false, error: "Error al desactivar industria" },
      { status: 500 }
    );
  }
}
