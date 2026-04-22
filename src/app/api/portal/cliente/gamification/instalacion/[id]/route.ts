import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { sanitizeGuardName, requirePortalClienteAuth } from "@/lib/portal-cliente";

export async function GET(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> },
) {
  try {
    const session = await requirePortalClienteAuth(request);
    if (!session) {
      return NextResponse.json({ success: false, error: "No autorizado" }, { status: 401 });
    }
    const { tenantId } = session;

    const { id: installationId } = await params;
    if (!session.installationIds.includes(installationId)) {
      return NextResponse.json({ success: false, error: "Sin acceso a esta instalación" }, { status: 403 });
    }

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

    // Days since last critical/high-severity incident for this installation
    let diasSinIncidentes: number | null = null;
    try {
      const lastIncident = await prisma.opsRondaIncidente.findFirst({
        where: {
          tenantId,
          installationId,
          tipo: { in: ["critico", "alta"] },
        },
        orderBy: { createdAt: "desc" },
        select: { createdAt: true },
      });
      if (lastIncident) {
        diasSinIncidentes = Math.floor(
          (Date.now() - lastIncident.createdAt.getTime()) / 86400000,
        );
      } else {
        diasSinIncidentes = 999;
      }
    } catch {
      diasSinIncidentes = null;
    }

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
        diasSinIncidentes,
        promedioIndustria: null,
      },
    });
  } catch (error) {
    console.error("[Portal Cliente] gamification/instalacion", error);
    return NextResponse.json({ success: false, error: "Error interno" }, { status: 500 });
  }
}
