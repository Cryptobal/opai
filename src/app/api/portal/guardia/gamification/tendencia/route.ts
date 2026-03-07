import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";

export async function GET(request: NextRequest) {
  try {
    const { searchParams } = new URL(request.url);
    const guardiaId = searchParams.get("guardiaId");

    if (!guardiaId) {
      return NextResponse.json(
        { success: false, error: "guardiaId es requerido" },
        { status: 400 },
      );
    }

    // Fetch last 6 months of monthly scores
    const monthlyScores = await prisma.gamificacionScoreGuardia.findMany({
      where: {
        guardiaId,
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
