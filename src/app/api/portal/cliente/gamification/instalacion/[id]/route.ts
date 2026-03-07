import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { sanitizeGuardName } from "@/lib/portal-cliente";

export async function GET(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> },
) {
  try {
    const tenantId = request.nextUrl.searchParams.get("tenantId");
    if (!tenantId) {
      return NextResponse.json({ success: false, error: "Parámetros requeridos" }, { status: 400 });
    }

    const { id: installationId } = await params;

    // Verify installation belongs to tenant
    const installation = await prisma.crmInstallation.findFirst({
      where: { id: installationId, tenantId },
      select: { id: true, name: true },
    });

    if (!installation) {
      return NextResponse.json({ success: false, error: "Instalación no encontrada" }, { status: 404 });
    }

    // Find the latest daily period for this installation
    const latest = await prisma.gamificacionScoreGuardia.findFirst({
      where: {
        installationId,
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
          instalacion: installation,
          periodo: null,
          ranking: [],
          trustScoreAvg: 0,
        },
      });
    }

    // Get scores for this installation in the latest period
    const scores = await prisma.gamificacionScoreGuardia.findMany({
      where: {
        installationId,
        tenantId,
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
    const trustScores = scores.filter((s) => s.trustScore > 0).map((s) => s.trustScore);
    const trustScoreAvg =
      trustScores.length > 0
        ? Math.round(trustScores.reduce((a, b) => a + b, 0) / trustScores.length)
        : 0;

    const ranking = scores.map((s, index) => ({
      posicion: index + 1,
      guardiaId: s.guardiaId,
      nombre: sanitizeGuardName(s.guardia.persona.firstName, s.guardia.persona.lastName),
      trustScore: s.trustScore,
      scoreRondas: s.scoreRondas,
      scoreAsistencia: s.scoreAsistencia,
      puntosNetos: s.puntosNetos,
      rachaActual: s.rachaActual,
      nivelActual: s.nivelActual,
    }));

    return NextResponse.json({
      success: true,
      data: {
        instalacion: installation,
        periodo,
        ranking,
        trustScoreAvg,
      },
    });
  } catch (error) {
    console.error("[Portal Cliente] gamification/instalacion", error);
    return NextResponse.json({ success: false, error: "Error interno" }, { status: 500 });
  }
}
