import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { requireAuth, unauthorized, resolveApiPerms } from "@/lib/api-auth";
import { canView } from "@/lib/permissions";

export async function GET(
  _request: NextRequest,
  { params }: { params: Promise<{ id: string }> },
) {
  try {
    const ctx = await requireAuth();
    if (!ctx) return unauthorized();
    const perms = await resolveApiPerms(ctx);
    if (!canView(perms, "ops")) {
      return NextResponse.json({ success: false, error: "Sin permisos" }, { status: 403 });
    }

    const { id } = await params;

    // Verify installation belongs to tenant
    const installation = await prisma.crmInstallation.findFirst({
      where: { id, tenantId: ctx.tenantId },
      select: { id: true, name: true },
    });

    if (!installation) {
      return NextResponse.json({ success: false, error: "Instalación no encontrada" }, { status: 404 });
    }

    // Get the latest daily period for this installation
    const latestScore = await prisma.gamificacionScoreGuardia.findFirst({
      where: {
        installationId: id,
        tenantId: ctx.tenantId,
        periodoTipo: "diario",
      },
      orderBy: { periodo: "desc" },
      select: { periodo: true },
    });

    if (!latestScore) {
      return NextResponse.json({
        success: true,
        data: {
          instalacion: installation,
          periodo: null,
          promedioTrustScore: 0,
          totalGuardias: 0,
          guardias: [],
        },
      });
    }

    const periodo = latestScore.periodo;

    // Get all guard scores for this installation in this period
    const scores = await prisma.gamificacionScoreGuardia.findMany({
      where: {
        installationId: id,
        tenantId: ctx.tenantId,
        periodoTipo: "diario",
        periodo,
      },
      include: {
        guardia: {
          select: {
            id: true,
            code: true,
            persona: {
              select: { firstName: true, lastName: true },
            },
          },
        },
      },
      orderBy: { trustScore: "desc" },
    });

    // Calculate average trust score
    const totalGuardias = scores.length;
    const promedioTrustScore =
      totalGuardias > 0
        ? scores.reduce((sum, s) => sum + s.trustScore, 0) / totalGuardias
        : 0;

    const guardias = scores.map((s, index) => ({
      posicion: index + 1,
      guardiaId: s.guardiaId,
      code: s.guardia.code,
      nombre: `${s.guardia.persona.firstName} ${s.guardia.persona.lastName}`,
      trustScore: s.trustScore,
      scoreRondas: s.scoreRondas,
      scoreAsistencia: s.scoreAsistencia,
      scoreSistemaDigital: s.scoreSistemaDigital,
      scoreSupervision: s.scoreSupervision,
      scoreCapacitacion: s.scoreCapacitacion,
      puntosNetos: s.puntosNetos,
      rachaActual: s.rachaActual,
      nivelActual: s.nivelActual,
      rankingInstalacion: s.rankingInstalacion,
    }));

    return NextResponse.json({
      success: true,
      data: {
        instalacion: installation,
        periodo,
        promedioTrustScore: Math.round(promedioTrustScore * 100) / 100,
        totalGuardias,
        guardias,
      },
    });
  } catch (error) {
    console.error("[API gamification/instalacion] GET error:", error);
    return NextResponse.json({ success: false, error: "Error interno" }, { status: 500 });
  }
}
