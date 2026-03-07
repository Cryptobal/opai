import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { getGamificacionConfig, getNivelActual, getNextNivel } from "@/lib/gamification";

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

    // Get the guard to obtain tenantId
    const guardia = await prisma.opsGuardia.findUnique({
      where: { id: guardiaId },
      select: { id: true, tenantId: true, currentInstallationId: true },
    });

    if (!guardia) {
      return NextResponse.json(
        { success: false, error: "Guardia no encontrado" },
        { status: 404 },
      );
    }

    const config = await getGamificacionConfig(guardia.tenantId);
    if (!config) {
      return NextResponse.json(
        { success: false, error: "Gamificación no configurada" },
        { status: 404 },
      );
    }

    // Get today's date string for daily period lookup
    const hoy = new Date();
    const periodoHoy = hoy.toISOString().split("T")[0]; // e.g. "2026-03-06"

    // Get the latest daily score for this guard
    const latestScore = await prisma.gamificacionScoreGuardia.findFirst({
      where: {
        guardiaId,
        periodoTipo: "diario",
      },
      orderBy: { fechaFin: "desc" },
    });

    // Get monthly score for current month
    const mesActual = `${hoy.getFullYear()}-${String(hoy.getMonth() + 1).padStart(2, "0")}`;
    const monthlyScore = await prisma.gamificacionScoreGuardia.findFirst({
      where: {
        guardiaId,
        periodoTipo: "mensual",
        periodo: mesActual,
      },
    });

    const puntosAcumulados = latestScore?.puntosAcumuladosHistorico ?? 0;
    const nivelActual = getNivelActual(config, puntosAcumulados);
    const nextNivel = getNextNivel(config, puntosAcumulados);

    const data = {
      puntosAcumulados,
      nivelActual,
      nextNivel,
      trustScore: latestScore?.trustScore ?? 0,
      rachaActual: latestScore?.rachaActual ?? 0,
      mejorRacha: latestScore?.mejorRacha ?? 0,
      puntosNetosMes: monthlyScore?.puntosNetos ?? 0,
      puntosGanadosMes: monthlyScore?.puntosGanados ?? 0,
      puntosPerdidosMes: monthlyScore?.puntosPerdidos ?? 0,
      rankingInstalacion: latestScore?.rankingInstalacion ?? null,
      totalGuardiasInstalacion: latestScore?.totalGuardiasInstalacion ?? null,
      rankingGlobal: latestScore?.rankingGlobal ?? null,
      totalGuardiasGlobal: latestScore?.totalGuardiasGlobal ?? null,
      scoreRondas: latestScore?.scoreRondas ?? 0,
      scoreAsistencia: latestScore?.scoreAsistencia ?? 0,
      scoreSistemaDigital: latestScore?.scoreSistemaDigital ?? 0,
      scoreSupervision: latestScore?.scoreSupervision ?? 0,
      scoreCapacitacion: latestScore?.scoreCapacitacion ?? 0,
      periodo: periodoHoy,
    };

    return NextResponse.json({ success: true, data });
  } catch (error) {
    console.error("[Portal Guardia] Gamification scorecard error:", error);
    return NextResponse.json(
      { success: false, error: "Error al obtener scorecard" },
      { status: 500 },
    );
  }
}
