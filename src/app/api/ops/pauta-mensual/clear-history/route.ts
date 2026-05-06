import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import { prisma } from "@/lib/prisma";
import { parseBody, requireAuth, unauthorized } from "@/lib/api-auth";
import { createOpsAuditLog, ensureOpsAccess } from "@/lib/ops";

const bodySchema = z.object({
  puestoId: z.string().uuid(),
});

/**
 * POST /api/ops/pauta-mensual/clear-history
 * Limpia los marcadores históricos de desasignación (previousGuardiaId, unassignedAt,
 * unassignedReason) en todas las celdas del puesto donde no hay guardia planificado.
 * Solo admins/superadmins.
 */
export async function POST(request: NextRequest) {
  try {
    const ctx = await requireAuth();
    if (!ctx) return unauthorized();
    const forbidden = await ensureOpsAccess(ctx);
    if (forbidden) return forbidden;

    if (!["admin", "superadmin"].includes(ctx.userRole)) {
      return NextResponse.json(
        { success: false, error: "Solo admin/superadmin puede limpiar el histórico" },
        { status: 403 }
      );
    }

    const parsed = await parseBody(request, bodySchema);
    if (parsed.error) return parsed.error;
    const { puestoId } = parsed.data;

    const puesto = await prisma.opsPuestoOperativo.findFirst({
      where: { id: puestoId, tenantId: ctx.tenantId },
      select: { id: true },
    });
    if (!puesto) {
      return NextResponse.json(
        { success: false, error: "Puesto no encontrado" },
        { status: 404 }
      );
    }

    const cleared = await prisma.opsPautaMensual.updateMany({
      where: {
        tenantId: ctx.tenantId,
        puestoId,
        plannedGuardiaId: null,
        previousGuardiaId: { not: null },
      },
      data: {
        previousGuardiaId: null,
        unassignedAt: null,
        unassignedReason: null,
      },
    });

    await createOpsAuditLog(ctx, "ops.pauta.clear_history", "ops_pauta", puestoId, {
      cleared: cleared.count,
    });

    return NextResponse.json({ success: true, data: { cleared: cleared.count } });
  } catch (error) {
    console.error("[OPS] Error clearing pauta history:", error);
    return NextResponse.json(
      { success: false, error: "No se pudo limpiar el histórico" },
      { status: 500 }
    );
  }
}
