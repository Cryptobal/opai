import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { requireAuth, unauthorized, resolveApiPerms } from "@/lib/api-auth";
import { canView } from "@/lib/permissions";
import { getGamificacionConfig, getNivelActual, getNextNivel } from "@/lib/gamification";

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

    // Verify the guard exists and belongs to this tenant
    const guardia = await prisma.opsGuardia.findFirst({
      where: { id, tenantId: ctx.tenantId },
      select: {
        id: true,
        code: true,
        status: true,
        currentInstallationId: true,
        persona: {
          select: { firstName: true, lastName: true, rut: true },
        },
        currentInstallation: {
          select: { id: true, name: true },
        },
      },
    });

    if (!guardia) {
      return NextResponse.json({ success: false, error: "Guardia no encontrado" }, { status: 404 });
    }

    // Get gamification config
    const config = await getGamificacionConfig(ctx.tenantId);
    if (!config) {
      return NextResponse.json({
        success: false,
        error: "Módulo de gamificación no configurado",
      }, { status: 404 });
    }

    // Last 6 monthly period scores
    const monthlyScores = await prisma.gamificacionScoreGuardia.findMany({
      where: { guardiaId: id, tenantId: ctx.tenantId, periodoTipo: "mensual" },
      orderBy: { periodo: "desc" },
      take: 6,
    });

    // Current daily score (latest)
    const latestDailyScore = await prisma.gamificacionScoreGuardia.findFirst({
      where: { guardiaId: id, tenantId: ctx.tenantId, periodoTipo: "diario" },
      orderBy: { periodo: "desc" },
    });

    // Current weekly score (latest)
    const latestWeeklyScore = await prisma.gamificacionScoreGuardia.findFirst({
      where: { guardiaId: id, tenantId: ctx.tenantId, periodoTipo: "semanal" },
      orderBy: { periodo: "desc" },
    });

    // Current badges
    const badges = await prisma.gamificacionGuardiaBadge.findMany({
      where: { guardiaId: id, tenantId: ctx.tenantId },
      include: {
        badge: {
          select: {
            id: true,
            codigo: true,
            nombre: true,
            descripcion: true,
            categoria: true,
            icono: true,
            color: true,
            puntosBonus: true,
          },
        },
      },
      orderBy: { desbloqueadoAt: "desc" },
    });

    // Recent events (last 20)
    const recentEvents = await prisma.gamificacionEvento.findMany({
      where: { guardiaId: id, tenantId: ctx.tenantId },
      orderBy: { fecha: "desc" },
      take: 20,
    });

    // Accumulated points for level calculation
    const puntosHistorico = await prisma.gamificacionEvento.aggregate({
      where: { guardiaId: id, tenantId: ctx.tenantId, puntos: { gt: 0 } },
      _sum: { puntos: true },
    });
    const puntosAcumulados = puntosHistorico._sum.puntos ?? 0;

    // Level info
    const nivelActual = getNivelActual(config, puntosAcumulados);
    const nextNivel = getNextNivel(config, puntosAcumulados);

    // Streak from latest daily score
    const rachaActual = latestDailyScore?.rachaActual ?? 0;
    const mejorRacha = latestDailyScore?.mejorRacha ?? 0;

    return NextResponse.json({
      success: true,
      data: {
        guardia: {
          id: guardia.id,
          code: guardia.code,
          status: guardia.status,
          nombre: `${guardia.persona.firstName} ${guardia.persona.lastName}`,
          rut: guardia.persona.rut,
          instalacion: guardia.currentInstallation,
        },
        nivel: {
          actual: nivelActual,
          puntosAcumulados,
          siguiente: nextNivel,
        },
        racha: {
          actual: rachaActual,
          mejor: mejorRacha,
        },
        scores: {
          diario: latestDailyScore,
          semanal: latestWeeklyScore,
          mensuales: monthlyScores,
        },
        badges: badges.map((gb) => ({
          ...gb.badge,
          desbloqueadoAt: gb.desbloqueadoAt,
          contexto: gb.contexto,
        })),
        eventosRecientes: recentEvents,
      },
    });
  } catch (error) {
    console.error("[API gamification/guardia] GET error:", error);
    return NextResponse.json({ success: false, error: "Error interno" }, { status: 500 });
  }
}
