import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { requireAuth, unauthorized, resolveApiPerms } from "@/lib/api-auth";
import { canEdit } from "@/lib/permissions";

const VALID_STATUSES = ["aprobado", "rechazado"];

export async function PUT(
  request: NextRequest,
  { params }: { params: Promise<{ id: string; sugId: string }> },
) {
  try {
    const ctx = await requireAuth();
    if (!ctx) return unauthorized();
    const perms = await resolveApiPerms(ctx);
    if (!canEdit(perms, "ops", "gamificacion")) {
      return NextResponse.json({ success: false, error: "Sin permisos" }, { status: 403 });
    }

    const { id: fondoId, sugId } = await params;

    // Verify the fondo exists and belongs to this tenant
    const fondo = await prisma.gamificacionFondoPremio.findFirst({
      where: { id: fondoId, tenantId: ctx.tenantId },
    });
    if (!fondo) {
      return NextResponse.json({ success: false, error: "Fondo no encontrado" }, { status: 404 });
    }

    // Verify the sugerencia exists and belongs to this fondo
    const existing = await prisma.gamificacionSugerenciaBono.findFirst({
      where: { id: sugId, fondoId, tenantId: ctx.tenantId },
    });
    if (!existing) {
      return NextResponse.json(
        { success: false, error: "Sugerencia no encontrada" },
        { status: 404 },
      );
    }

    // Only pending sugerencias can be approved/rejected
    if (existing.status !== "pendiente") {
      return NextResponse.json(
        { success: false, error: `La sugerencia ya fue procesada (status: ${existing.status})` },
        { status: 400 },
      );
    }

    const body = await request.json();

    if (!body.status || !VALID_STATUSES.includes(body.status)) {
      return NextResponse.json(
        {
          success: false,
          error: `Status inválido. Opciones: ${VALID_STATUSES.join(", ")}`,
        },
        { status: 400 },
      );
    }

    const now = new Date();
    const updateData: Record<string, unknown> = { status: body.status };

    if (body.status === "aprobado") {
      updateData.aprobadoPor = ctx.userId;
      updateData.aprobadoAt = now;
    } else {
      updateData.rechazadoPor = ctx.userId;
      updateData.rechazadoAt = now;
      updateData.motivoRechazo = body.motivoRechazo ?? null;
    }

    const sugerencia = await prisma.gamificacionSugerenciaBono.update({
      where: { id: sugId },
      data: updateData,
    });

    return NextResponse.json({ success: true, data: sugerencia });
  } catch (error) {
    console.error("[API gamification/fondos/sugerencias] PUT error:", error);
    return NextResponse.json({ success: false, error: "Error interno" }, { status: 500 });
  }
}
