import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { requirePortalClienteAuth } from "@/lib/portal-cliente";

export async function GET(request: NextRequest) {
  try {
    const session = await requirePortalClienteAuth();
    if (!session) {
      return NextResponse.json({ success: false, error: "No autorizado" }, { status: 401 });
    }
    const { tenantId } = session;

    const installationId = request.nextUrl.searchParams.get("installationId");
    if (!installationId || !session.installationIds.includes(installationId)) {
      return NextResponse.json({ success: false, error: "Sin acceso a esta instalación" }, { status: 403 });
    }

    const now = new Date();
    const monthStart = new Date(now.getFullYear(), now.getMonth(), 1);
    const prevMonthStart = new Date(now.getFullYear(), now.getMonth() - 1, 1);

    const [currentRows, prevRows, currentAlerts, prevAlerts] = await Promise.all([
      prisma.opsRondaEjecucion.findMany({
        where: { tenantId, installationId, scheduledAt: { gte: monthStart } },
        select: { status: true, trustScore: true },
      }),
      prisma.opsRondaEjecucion.findMany({
        where: { tenantId, installationId, scheduledAt: { gte: prevMonthStart, lt: monthStart } },
        select: { status: true, trustScore: true },
      }),
      prisma.opsAlertaRonda.count({
        where: { tenantId, installationId, createdAt: { gte: monthStart } },
      }),
      prisma.opsAlertaRonda.count({
        where: { tenantId, installationId, createdAt: { gte: prevMonthStart, lt: monthStart } },
      }),
    ]);

    const curCompleted = currentRows.filter((r) => r.status === "completada").length;
    const curTotal = currentRows.length;
    const curCompliance = curTotal > 0 ? Math.round((curCompleted / curTotal) * 100) : 0;
    const curScores = currentRows.filter((r) => r.trustScore > 0).map((r) => r.trustScore);
    const curTrust = curScores.length > 0 ? Math.round(curScores.reduce((a, b) => a + b, 0) / curScores.length) : 0;

    const prevCompleted = prevRows.filter((r) => r.status === "completada").length;
    const prevTotal = prevRows.length;
    const prevCompliance = prevTotal > 0 ? Math.round((prevCompleted / prevTotal) * 100) : 0;
    const prevScores = prevRows.filter((r) => r.trustScore > 0).map((r) => r.trustScore);
    const prevTrust = prevScores.length > 0 ? Math.round(prevScores.reduce((a, b) => a + b, 0) / prevScores.length) : 0;

    return NextResponse.json({
      success: true,
      data: {
        compliance: curCompliance,
        complianceTrend: curCompliance - prevCompliance,
        completedRounds: curCompleted,
        totalRounds: curTotal,
        trustScore: curTrust,
        trustTrend: curTrust - prevTrust,
        alerts: currentAlerts,
        alertsTrend: currentAlerts - prevAlerts,
      },
    });
  } catch (error) {
    console.error("[Portal Cliente] summary", error);
    return NextResponse.json({ success: false, error: "Error interno" }, { status: 500 });
  }
}
