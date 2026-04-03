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

    const now = new Date();

    const beneficios = await prisma.gamificacionBeneficio.findMany({
      where: {
        tenantId: guardAuth.tenantId,
        activo: true,
        OR: [
          { fechaInicio: null },
          { fechaInicio: { lte: now } },
        ],
        AND: [
          {
            OR: [
              { fechaFin: null },
              { fechaFin: { gte: now } },
            ],
          },
        ],
      },
      select: {
        id: true,
        nombre: true,
        descripcion: true,
        categoria: true,
        costoPuntos: true,
        proveedor: true,
        imagenUrl: true,
        stockDisponible: true,
        fechaInicio: true,
        fechaFin: true,
      },
      orderBy: [{ categoria: "asc" }, { costoPuntos: "asc" }],
    });

    // Get the guard's current accumulated points to show affordability
    const latestScore = await prisma.gamificacionScoreGuardia.findFirst({
      where: {
        guardiaId: guardAuth.guardiaId,
        periodoTipo: "diario",
      },
      orderBy: { fechaFin: "desc" },
      select: { puntosAcumuladosHistorico: true },
    });

    const puntosDisponibles = latestScore?.puntosAcumuladosHistorico ?? 0;

    // Calculate total redeemed points to determine actually available points
    const puntosCanjeados = await prisma.gamificacionCanje.aggregate({
      where: { guardiaId: guardAuth.guardiaId },
      _sum: { puntosUsados: true },
    });

    const puntosUsados = puntosCanjeados._sum.puntosUsados ?? 0;
    const saldoPuntos = puntosDisponibles - puntosUsados;

    const data = beneficios.map((b) => ({
      ...b,
      alcanzable: b.costoPuntos !== null ? saldoPuntos >= b.costoPuntos : true,
      disponible: b.stockDisponible === null || b.stockDisponible > 0,
    }));

    return NextResponse.json({
      success: true,
      data,
      saldoPuntos,
    });
  } catch (error) {
    console.error("[Portal Guardia] Gamification beneficios error:", error);
    return NextResponse.json(
      { success: false, error: "Error al obtener beneficios" },
      { status: 500 },
    );
  }
}
