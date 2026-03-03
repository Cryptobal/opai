import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { requireAuth, unauthorized } from "@/lib/api-auth";
import { ensureOpsAccess, parseDateOnly } from "@/lib/ops";

export async function GET(request: NextRequest) {
  try {
    const ctx = await requireAuth();
    if (!ctx) return unauthorized();
    const forbidden = await ensureOpsAccess(ctx);
    if (forbidden) return forbidden;

    const fromRaw = request.nextUrl.searchParams.get("from");
    const toRaw = request.nextUrl.searchParams.get("to");
    const installationId = request.nextUrl.searchParams.get("installationId") || undefined;

    const now = new Date();
    const from = fromRaw ? parseDateOnly(fromRaw) : new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), 1));
    const to = toRaw ? parseDateOnly(toRaw) : now;

    const where = {
      tenantId: ctx.tenantId,
      date: { gte: from, lte: to },
      status: { in: ["pending", "approved", "paid"] },
      ...(installationId && installationId !== "all" ? { installationId } : {}),
    };

    const [teRows, totalGuards] = await Promise.all([
      prisma.opsTurnoExtra.findMany({
        where,
        select: {
          id: true,
          amountClp: true,
          isManual: true,
          asistenciaId: true,
          asistencia: { select: { plannedGuardiaId: true } },
          refuerzoSolicitud: { select: { id: true } },
          guardiaId: true,
        },
      }),
      prisma.opsGuardia.count({
        where: { tenantId: ctx.tenantId, status: "active" },
      }),
    ]);

    let totalAmount = 0;
    const byOrigin = { ausencia: 0, ppc: 0, manual: 0, refuerzo: 0 };
    const uniqueGuards = new Set<string>();

    for (const te of teRows) {
      const amt = Number(te.amountClp);
      totalAmount += amt;
      uniqueGuards.add(te.guardiaId);

      if (te.refuerzoSolicitud) {
        byOrigin.refuerzo++;
      } else if (te.isManual && !te.asistenciaId) {
        byOrigin.manual++;
      } else if (te.asistenciaId && te.asistencia?.plannedGuardiaId) {
        byOrigin.ausencia++;
      } else {
        byOrigin.ppc++;
      }
    }

    const count = teRows.length;
    const avgAmount = count > 0 ? Math.round(totalAmount / count) : 0;
    const tePercentage = totalGuards > 0
      ? Math.round((uniqueGuards.size / totalGuards) * 10000) / 100
      : 0;

    return NextResponse.json({
      success: true,
      data: {
        from: from.toISOString().slice(0, 10),
        to: to.toISOString().slice(0, 10),
        count,
        totalAmount: Math.round(totalAmount),
        avgAmount,
        totalGuards,
        uniqueGuards: uniqueGuards.size,
        tePercentage,
        byOrigin,
      },
    });
  } catch (error) {
    console.error("[TE] Error fetching stats:", error);
    return NextResponse.json({ success: false, error: "Error obteniendo estadísticas TE" }, { status: 500 });
  }
}
