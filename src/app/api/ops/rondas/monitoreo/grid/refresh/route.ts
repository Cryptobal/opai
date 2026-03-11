import { NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { requireAuth, unauthorized, resolveApiPerms } from "@/lib/api-auth";
import { canEdit } from "@/lib/permissions";

/**
 * POST /api/ops/rondas/monitoreo/grid/refresh
 * Re-syncs guards from pauta mensual for the active turno's CN.
 * Preserves guards with manual status (presente, no_viene, reemplazo, etc.)
 * Only removes stale "pendiente" guards and adds new ones from pauta.
 */
export async function POST() {
  try {
    const ctx = await requireAuth();
    if (!ctx) return unauthorized();
    const perms = await resolveApiPerms(ctx);
    if (!canEdit(perms, "ops", "rondas")) {
      return NextResponse.json({ success: false, error: "Sin permisos" }, { status: 403 });
    }

    // Find the active turno for this operator
    const turno = await prisma.opsMonitoreoTurno.findFirst({
      where: { tenantId: ctx.tenantId, operatorId: ctx.userId, status: "active" },
      select: { id: true, controlNocturnoId: true },
    });

    if (!turno?.controlNocturnoId) {
      return NextResponse.json(
        { success: false, error: "No hay turno activo con control nocturno" },
        { status: 404 },
      );
    }

    const cn = await prisma.opsControlNocturno.findUnique({
      where: { id: turno.controlNocturnoId },
      select: { id: true, shiftStart: true, shiftEnd: true },
    });

    if (!cn) {
      return NextResponse.json(
        { success: false, error: "Control nocturno no encontrado" },
        { status: 404 },
      );
    }

    const { generateGridSlots } = await import("@/lib/rondas/generate-grid");
    await generateGridSlots({
      controlNocturnoId: cn.id,
      tenantId: ctx.tenantId,
      shiftStart: cn.shiftStart,
      shiftEnd: cn.shiftEnd,
    });

    return NextResponse.json({ success: true });
  } catch (error) {
    console.error("[RONDAS] POST grid/refresh", error);
    return NextResponse.json({ success: false, error: "Error interno" }, { status: 500 });
  }
}
