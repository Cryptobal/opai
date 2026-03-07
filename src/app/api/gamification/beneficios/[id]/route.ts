import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { requireAuth, unauthorized, resolveApiPerms } from "@/lib/api-auth";
import { canEdit } from "@/lib/permissions";

const VALID_CATEGORIAS = ["convenio", "tiempo_libre", "producto", "experiencia"];

export async function PUT(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> },
) {
  try {
    const ctx = await requireAuth();
    if (!ctx) return unauthorized();
    const perms = await resolveApiPerms(ctx);
    if (!canEdit(perms, "ops")) {
      return NextResponse.json({ success: false, error: "Sin permisos" }, { status: 403 });
    }

    const { id } = await params;

    // Verify the beneficio exists and belongs to this tenant
    const existing = await prisma.gamificacionBeneficio.findFirst({
      where: { id, tenantId: ctx.tenantId },
    });
    if (!existing) {
      return NextResponse.json({ success: false, error: "Beneficio no encontrado" }, { status: 404 });
    }

    const body = await request.json();

    // Validate categoria if provided
    if (body.categoria && !VALID_CATEGORIAS.includes(body.categoria)) {
      return NextResponse.json(
        {
          success: false,
          error: `Categoría inválida. Opciones: ${VALID_CATEGORIAS.join(", ")}`,
        },
        { status: 400 },
      );
    }

    // Remove non-updatable fields
    delete body.id;
    delete body.tenantId;
    delete body.createdAt;
    delete body.updatedAt;

    // Convert date strings if present
    if (body.fechaInicio) body.fechaInicio = new Date(body.fechaInicio);
    if (body.fechaFin) body.fechaFin = new Date(body.fechaFin);

    const beneficio = await prisma.gamificacionBeneficio.update({
      where: { id },
      data: body,
    });

    return NextResponse.json({ success: true, data: beneficio });
  } catch (error) {
    console.error("[API gamification/beneficios] PUT error:", error);
    return NextResponse.json({ success: false, error: "Error interno" }, { status: 500 });
  }
}

export async function DELETE(
  _request: NextRequest,
  { params }: { params: Promise<{ id: string }> },
) {
  try {
    const ctx = await requireAuth();
    if (!ctx) return unauthorized();
    const perms = await resolveApiPerms(ctx);
    if (!canEdit(perms, "ops")) {
      return NextResponse.json({ success: false, error: "Sin permisos" }, { status: 403 });
    }

    const { id } = await params;

    // Verify the beneficio exists and belongs to this tenant
    const existing = await prisma.gamificacionBeneficio.findFirst({
      where: { id, tenantId: ctx.tenantId },
    });
    if (!existing) {
      return NextResponse.json({ success: false, error: "Beneficio no encontrado" }, { status: 404 });
    }

    // Soft delete: set activo = false
    const beneficio = await prisma.gamificacionBeneficio.update({
      where: { id },
      data: { activo: false },
    });

    return NextResponse.json({ success: true, data: beneficio });
  } catch (error) {
    console.error("[API gamification/beneficios] DELETE error:", error);
    return NextResponse.json({ success: false, error: "Error interno" }, { status: 500 });
  }
}
