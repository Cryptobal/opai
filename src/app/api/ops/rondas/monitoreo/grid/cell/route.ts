import { NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { requireAuth, unauthorized, resolveApiPerms } from "@/lib/api-auth";
import { canEdit } from "@/lib/permissions";

export async function PATCH(request: Request) {
  try {
    const ctx = await requireAuth();
    if (!ctx) return unauthorized();
    const perms = await resolveApiPerms(ctx);
    if (!canEdit(perms, "ops", "rondas")) {
      return NextResponse.json({ success: false, error: "Sin permisos" }, { status: 403 });
    }

    const { controlNocturnoRondaId, status, horaMarcada, notes } = await request.json();

    if (!controlNocturnoRondaId) {
      return NextResponse.json({ success: false, error: "Missing rondaId" }, { status: 400 });
    }

    // Verify current user is the active turno operator
    const activeTurno = await prisma.opsMonitoreoTurno.findFirst({
      where: { tenantId: ctx.tenantId, status: "active" },
      select: { operatorId: true },
    });
    if (activeTurno && activeTurno.operatorId !== ctx.userId) {
      return NextResponse.json(
        { success: false, error: "Solo el operador del turno activo puede realizar esta acción" },
        { status: 403 },
      );
    }

    // Verify ownership via tenant
    const ronda = await prisma.opsControlNocturnoRonda.findUnique({
      where: { id: controlNocturnoRondaId },
      include: {
        controlInstalacion: {
          include: { controlNocturno: { select: { tenantId: true } } },
        },
      },
    });

    if (!ronda || ronda.controlInstalacion.controlNocturno.tenantId !== ctx.tenantId) {
      return NextResponse.json({ success: false, error: "Not found" }, { status: 404 });
    }

    await prisma.opsControlNocturnoRonda.update({
      where: { id: controlNocturnoRondaId },
      data: {
        status,
        horaMarcada: horaMarcada || null,
        notes: notes || null,
        manualOverride: true,
        overrideBy: ctx.userId,
        overrideAt: new Date(),
      },
    });

    return NextResponse.json({ success: true });
  } catch (error) {
    console.error("[GRID] PATCH cell", error);
    return NextResponse.json({ success: false, error: "Error interno" }, { status: 500 });
  }
}
