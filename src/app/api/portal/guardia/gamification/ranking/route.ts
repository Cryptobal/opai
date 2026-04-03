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

    // Get the guard's current installation and persona
    const guardia = await prisma.opsGuardia.findUnique({
      where: { id: guardAuth.guardiaId },
      select: {
        currentInstallationId: true,
        persona: { select: { firstName: true, lastName: true } },
      },
    });

    if (!guardia) {
      return NextResponse.json(
        { success: false, error: "Guardia no encontrado" },
        { status: 404 },
      );
    }

    if (!guardia.currentInstallationId) {
      return NextResponse.json({
        success: true,
        data: {
          topRanking: [],
          myPosition: null,
          installationId: null,
        },
      });
    }

    // Find the latest daily period that has ranking data for this installation
    const latestPeriod = await prisma.gamificacionScoreGuardia.findFirst({
      where: {
        installationId: guardia.currentInstallationId,
        periodoTipo: "diario",
        rankingInstalacion: { not: null },
      },
      orderBy: { fechaFin: "desc" },
      select: { periodo: true },
    });

    if (!latestPeriod) {
      return NextResponse.json({
        success: true,
        data: {
          topRanking: [],
          myPosition: null,
          installationId: guardia.currentInstallationId,
        },
      });
    }

    // Get top 10 for this installation in the latest period
    const topScores = await prisma.gamificacionScoreGuardia.findMany({
      where: {
        installationId: guardia.currentInstallationId,
        periodoTipo: "diario",
        periodo: latestPeriod.periodo,
        rankingInstalacion: { not: null },
      },
      orderBy: { rankingInstalacion: "asc" },
      take: 10,
      select: {
        guardiaId: true,
        rankingInstalacion: true,
        trustScore: true,
        puntosNetos: true,
        puntosAcumuladosHistorico: true,
        nivelActual: true,
        rachaActual: true,
        guardia: {
          select: {
            persona: { select: { firstName: true, lastName: true } },
          },
        },
      },
    });

    const topRanking = topScores.map((s) => ({
      guardiaId: s.guardiaId,
      nombre: `${s.guardia.persona.firstName} ${s.guardia.persona.lastName}`,
      posicion: s.rankingInstalacion,
      trustScore: s.trustScore,
      puntosNetos: s.puntosNetos,
      nivelActual: s.nivelActual,
      rachaActual: s.rachaActual,
      esYo: s.guardiaId === guardAuth.guardiaId,
    }));

    // Get the guard's own position (might not be in top 10)
    const myScore = await prisma.gamificacionScoreGuardia.findFirst({
      where: {
        guardiaId: guardAuth.guardiaId,
        periodoTipo: "diario",
        periodo: latestPeriod.periodo,
      },
      select: {
        rankingInstalacion: true,
        totalGuardiasInstalacion: true,
        trustScore: true,
        puntosNetos: true,
        puntosAcumuladosHistorico: true,
        nivelActual: true,
        rachaActual: true,
      },
    });

    const myPosition = myScore
      ? {
          guardiaId: guardAuth.guardiaId,
          nombre: `${guardia.persona.firstName} ${guardia.persona.lastName}`,
          posicion: myScore.rankingInstalacion,
          totalGuardias: myScore.totalGuardiasInstalacion,
          trustScore: myScore.trustScore,
          puntosNetos: myScore.puntosNetos,
          nivelActual: myScore.nivelActual,
          rachaActual: myScore.rachaActual,
        }
      : null;

    return NextResponse.json({
      success: true,
      data: {
        topRanking,
        myPosition,
        installationId: guardia.currentInstallationId,
        periodo: latestPeriod.periodo,
      },
    });
  } catch (error) {
    console.error("[Portal Guardia] Gamification ranking error:", error);
    return NextResponse.json(
      { success: false, error: "Error al obtener ranking" },
      { status: 500 },
    );
  }
}
