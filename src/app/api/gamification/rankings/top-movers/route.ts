import { NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { requireAuth, unauthorized, resolveApiPerms } from "@/lib/api-auth";
import { canView } from "@/lib/permissions";

export async function GET() {
  try {
    const ctx = await requireAuth();
    if (!ctx) return unauthorized();
    const perms = await resolveApiPerms(ctx);
    if (!canView(perms, "ops")) {
      return NextResponse.json({ success: false, error: "Sin permisos" }, { status: 403 });
    }

    // Find the two most recent distinct daily periods
    const recentPeriods = await prisma.gamificacionScoreGuardia.findMany({
      where: {
        tenantId: ctx.tenantId,
        periodoTipo: "diario",
      },
      select: { periodo: true },
      distinct: ["periodo"],
      orderBy: { periodo: "desc" },
      take: 2,
    });

    if (recentPeriods.length < 2) {
      return NextResponse.json({
        success: true,
        data: {
          periodoActual: recentPeriods[0]?.periodo ?? null,
          periodoAnterior: null,
          topMovers: [],
        },
      });
    }

    const periodoActual = recentPeriods[0].periodo;
    const periodoAnterior = recentPeriods[1].periodo;

    // Get scores for both periods
    const [scoresActuales, scoresAnteriores] = await Promise.all([
      prisma.gamificacionScoreGuardia.findMany({
        where: {
          tenantId: ctx.tenantId,
          periodoTipo: "diario",
          periodo: periodoActual,
          rankingGlobal: { not: null },
        },
        select: {
          guardiaId: true,
          rankingGlobal: true,
          trustScore: true,
          guardia: {
            select: {
              id: true,
              code: true,
              persona: {
                select: { firstName: true, lastName: true },
              },
              currentInstallation: {
                select: { id: true, name: true },
              },
            },
          },
        },
      }),
      prisma.gamificacionScoreGuardia.findMany({
        where: {
          tenantId: ctx.tenantId,
          periodoTipo: "diario",
          periodo: periodoAnterior,
          rankingGlobal: { not: null },
        },
        select: {
          guardiaId: true,
          rankingGlobal: true,
        },
      }),
    ]);

    // Build a map of previous rankings
    const prevRankingMap = new Map<string, number>();
    for (const s of scoresAnteriores) {
      if (s.rankingGlobal != null) {
        prevRankingMap.set(s.guardiaId, s.rankingGlobal);
      }
    }

    // Calculate position changes (positive = improved, e.g. went from #10 to #5 = +5)
    const movers = scoresActuales
      .filter((s) => s.rankingGlobal != null && prevRankingMap.has(s.guardiaId))
      .map((s) => {
        const prevRanking = prevRankingMap.get(s.guardiaId)!;
        const currentRanking = s.rankingGlobal!;
        // Lower ranking number = better position, so positive change = prev - current
        const cambio = prevRanking - currentRanking;
        return {
          guardiaId: s.guardiaId,
          code: s.guardia.code,
          nombre: `${s.guardia.persona.firstName} ${s.guardia.persona.lastName}`,
          instalacion: s.guardia.currentInstallation,
          trustScore: s.trustScore,
          rankingActual: currentRanking,
          rankingAnterior: prevRanking,
          cambio,
        };
      })
      .filter((m) => m.cambio > 0) // Only those who improved
      .sort((a, b) => b.cambio - a.cambio) // Biggest improvement first
      .slice(0, 10);

    return NextResponse.json({
      success: true,
      data: {
        periodoActual,
        periodoAnterior,
        topMovers: movers,
      },
    });
  } catch (error) {
    console.error("[API gamification/rankings/top-movers] GET error:", error);
    return NextResponse.json({ success: false, error: "Error interno" }, { status: 500 });
  }
}
