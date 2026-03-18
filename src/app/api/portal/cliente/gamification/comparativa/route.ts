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

    // Find the latest daily period for this tenant
    const latest = await prisma.gamificacionScoreGuardia.findFirst({
      where: {
        tenantId,
        periodoTipo: "diario",
      },
      orderBy: { periodo: "desc" },
      select: { periodo: true },
    });

    const periodo = latest?.periodo ?? null;

    if (!periodo) {
      return NextResponse.json({
        success: true,
        data: {
          periodo: null,
          instalacionAvg: 0,
          tenantAvg: 0,
          diferencia: 0,
        },
      });
    }

    // Get avg trust score for the installation and for the whole tenant in parallel
    const [instalacionScores, tenantScores] = await Promise.all([
      prisma.gamificacionScoreGuardia.findMany({
        where: {
          installationId,
          tenantId,
          periodoTipo: "diario",
          periodo,
        },
        select: { trustScore: true },
      }),
      prisma.gamificacionScoreGuardia.findMany({
        where: {
          tenantId,
          periodoTipo: "diario",
          periodo,
        },
        select: { trustScore: true },
      }),
    ]);

    const instScores = instalacionScores.filter((s) => s.trustScore > 0).map((s) => s.trustScore);
    const instalacionAvg =
      instScores.length > 0
        ? Math.round(instScores.reduce((a, b) => a + b, 0) / instScores.length)
        : 0;

    const tScores = tenantScores.filter((s) => s.trustScore > 0).map((s) => s.trustScore);
    const tenantAvg =
      tScores.length > 0
        ? Math.round(tScores.reduce((a, b) => a + b, 0) / tScores.length)
        : 0;

    return NextResponse.json({
      success: true,
      data: {
        periodo,
        instalacionAvg,
        tenantAvg,
        diferencia: instalacionAvg - tenantAvg,
      },
    });
  } catch (error) {
    console.error("[Portal Cliente] gamification/comparativa", error);
    return NextResponse.json({ success: false, error: "Error interno" }, { status: 500 });
  }
}
