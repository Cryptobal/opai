import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { requirePortalGuardiaAuth } from "@/lib/portal-guardia-auth";

export async function GET(request: NextRequest) {
  try {
    const { searchParams } = new URL(request.url);
    const guardiaId = searchParams.get("guardiaId");
    const guardAuth = await requirePortalGuardiaAuth(guardiaId);
    if (!guardAuth) {
      return NextResponse.json(
        { success: false, error: "Guardia no encontrado o inactivo" },
        { status: 401 },
      );
    }

    // Fetch last 6 months of monthly scores
    const monthlyScores = await prisma.gamificacionScoreGuardia.findMany({
      where: {
        guardiaId: guardAuth.guardiaId,
        periodoTipo: "mensual",
      },
      orderBy: { periodo: "desc" },
      take: 6,
      select: {
        periodo: true,
        trustScore: true,
        puntosGanados: true,
        puntosPerdidos: true,
        puntosNetos: true,
        scoreRondas: true,
        scoreAsistencia: true,
        scoreSistemaDigital: true,
        scoreSupervision: true,
        scoreCapacitacion: true,
        rachaActual: true,
        rankingInstalacion: true,
        rankingGlobal: true,
      },
    });

    // Reverse to chronological order (oldest first) for chart display
    const data = monthlyScores.reverse();

    return NextResponse.json({ success: true, data });
  } catch (error) {
    console.error("[Portal Guardia] Gamification tendencia error:", error);
    return NextResponse.json(
      { success: false, error: "Error al obtener tendencia" },
      { status: 500 },
    );
  }
}
