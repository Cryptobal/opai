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
    const now = new Date();
    const from = fromRaw ? parseDateOnly(fromRaw) : new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), 1));
    const to = toRaw ? parseDateOnly(toRaw) : now;

    const teRows = await prisma.opsTurnoExtra.findMany({
      where: {
        tenantId: ctx.tenantId,
        date: { gte: from, lte: to },
        status: { in: ["pending", "approved", "paid"] },
      },
      select: {
        installationId: true,
        installation: { select: { name: true } },
        amountClp: true,
        isManual: true,
        asistenciaId: true,
        asistencia: { select: { plannedGuardiaId: true } },
        refuerzoSolicitud: { select: { id: true } },
      },
    });

    const instMap = new Map<string, {
      name: string;
      teCount: number;
      totalAmount: number;
      byOrigin: { ausencia: number; ppc: number; manual: number; refuerzo: number };
    }>();

    let grandTotal = 0;

    for (const te of teRows) {
      const amt = Number(te.amountClp);
      grandTotal += amt;

      let stat = instMap.get(te.installationId);
      if (!stat) {
        stat = {
          name: te.installation.name,
          teCount: 0,
          totalAmount: 0,
          byOrigin: { ausencia: 0, ppc: 0, manual: 0, refuerzo: 0 },
        };
        instMap.set(te.installationId, stat);
      }

      stat.teCount++;
      stat.totalAmount += amt;

      if (te.refuerzoSolicitud) {
        stat.byOrigin.refuerzo++;
      } else if (te.isManual && !te.asistenciaId) {
        stat.byOrigin.manual++;
      } else if (te.asistenciaId && te.asistencia?.plannedGuardiaId) {
        stat.byOrigin.ausencia++;
      } else {
        stat.byOrigin.ppc++;
      }
    }

    const rankings = Array.from(instMap.entries())
      .map(([installationId, s]) => ({
        installationId,
        name: s.name,
        teCount: s.teCount,
        totalAmount: Math.round(s.totalAmount),
        avgAmount: s.teCount > 0 ? Math.round(s.totalAmount / s.teCount) : 0,
        percentOfTotal: grandTotal > 0 ? Math.round((s.totalAmount / grandTotal) * 10000) / 100 : 0,
        byOrigin: s.byOrigin,
      }))
      .sort((a, b) => b.totalAmount - a.totalAmount);

    return NextResponse.json({
      success: true,
      data: { from: from.toISOString().slice(0, 10), to: to.toISOString().slice(0, 10), grandTotal: Math.round(grandTotal), rankings },
    });
  } catch (error) {
    console.error("[TE] Error fetching by-installation:", error);
    return NextResponse.json({ success: false, error: "Error obteniendo TE por instalación" }, { status: 500 });
  }
}
