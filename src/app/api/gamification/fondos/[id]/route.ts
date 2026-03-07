import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { requireAuth, unauthorized, resolveApiPerms } from "@/lib/api-auth";
import { canEdit } from "@/lib/permissions";

const VALID_TIPOS = ["mensual", "evento_especial", "instalacion"];

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

    // Verify the fondo exists and belongs to this tenant
    const existing = await prisma.gamificacionFondoPremio.findFirst({
      where: { id, tenantId: ctx.tenantId },
    });
    if (!existing) {
      return NextResponse.json({ success: false, error: "Fondo no encontrado" }, { status: 404 });
    }

    const body = await request.json();

    // Validate tipo if provided
    if (body.tipo && !VALID_TIPOS.includes(body.tipo)) {
      return NextResponse.json(
        {
          success: false,
          error: `Tipo inválido. Opciones: ${VALID_TIPOS.join(", ")}`,
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

    const fondo = await prisma.gamificacionFondoPremio.update({
      where: { id },
      data: body,
    });

    return NextResponse.json({ success: true, data: fondo });
  } catch (error) {
    console.error("[API gamification/fondos] PUT error:", error);
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

    // Verify the fondo exists and belongs to this tenant
    const existing = await prisma.gamificacionFondoPremio.findFirst({
      where: { id, tenantId: ctx.tenantId },
    });
    if (!existing) {
      return NextResponse.json({ success: false, error: "Fondo no encontrado" }, { status: 404 });
    }

    // Soft delete: set status = "cancelado"
    const fondo = await prisma.gamificacionFondoPremio.update({
      where: { id },
      data: { status: "cancelado" },
    });

    return NextResponse.json({ success: true, data: fondo });
  } catch (error) {
    console.error("[API gamification/fondos] DELETE error:", error);
    return NextResponse.json({ success: false, error: "Error interno" }, { status: 500 });
  }
}
