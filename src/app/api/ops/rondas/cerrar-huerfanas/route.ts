import { NextRequest, NextResponse } from "next/server";
import { requireAuth, unauthorized, resolveApiPerms } from "@/lib/api-auth";
import { canEdit, hasCapability } from "@/lib/permissions";
import { prisma } from "@/lib/prisma";
import { getPusherServer } from "@/lib/chat";

/**
 * POST /api/ops/rondas/cerrar-huerfanas
 *
 * Closes orphaned ad-hoc rondas that have been stuck in "en_curso" status
 * longer than the specified threshold (default 4 hours).
 *
 * Body: { maxHoursOpen?: number }
 * Response: { success: true, data: { cerradas: number, ids: string[] } }
 */
export async function POST(request: NextRequest) {
  try {
    const ctx = await requireAuth();
    if (!ctx) return unauthorized();

    const perms = await resolveApiPerms(ctx);
    if (!canEdit(perms, "ops", "rondas") || !hasCapability(perms, "rondas_configure")) {
      return NextResponse.json({ success: false, error: "Sin permisos" }, { status: 403 });
    }

    // Parse body — default maxHoursOpen to 4 if missing or invalid
    let maxHoursOpen = 4;
    try {
      const body = await request.json();
      const parsed = Number(body?.maxHoursOpen);
      if (Number.isFinite(parsed) && parsed > 0) {
        maxHoursOpen = parsed;
      }
    } catch {
      // No body or invalid JSON — use default
    }

    const now = new Date();
    const cutoff = new Date(now.getTime() - maxHoursOpen * 60 * 60 * 1000);

    // Find orphaned ad-hoc executions
    const orphaned = await prisma.opsRondaEjecucion.findMany({
      where: {
        tenantId: ctx.tenantId,
        isAdHoc: true,
        status: "en_curso",
        startedAt: { lte: cutoff },
      },
      select: { id: true },
    });

    if (orphaned.length === 0) {
      return NextResponse.json({ success: true, data: { cerradas: 0, ids: [] } });
    }

    const ids = orphaned.map((ej) => ej.id);

    // Batch update all orphaned executions
    await prisma.opsRondaEjecucion.updateMany({
      where: { id: { in: ids } },
      data: {
        status: "cerrada_admin",
        completedAt: now,
        trustScore: 0,
        trustBreakdown: {
          reason: "admin_closed_orphan",
          closedBy: ctx.userId,
          closedAt: now.toISOString(),
        } as never,
        notes: "Cerrada por administrador — excedió duración máxima",
      },
    });

    // Fire-and-forget Pusher notification to monitoreo channel
    try {
      const pusher = getPusherServer();
      await pusher.trigger(`monitoreo-${ctx.tenantId}`, "ronda-completed", {
        bulkClose: true,
        count: ids.length,
        ids,
      });
    } catch (pusherErr) {
      console.error("[CERRAR_HUERFANAS] Pusher trigger failed:", pusherErr);
    }

    console.log(`[CERRAR_HUERFANAS] ${ids.length} rondas huérfanas cerradas por ${ctx.userId}`);

    return NextResponse.json({
      success: true,
      data: { cerradas: ids.length, ids },
    });
  } catch (err) {
    console.error("[CERRAR_HUERFANAS]", err);
    return NextResponse.json({ success: false, error: "Error interno" }, { status: 500 });
  }
}
