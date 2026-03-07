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

    // Get the guard to obtain tenantId
    const guardia = await prisma.opsGuardia.findUnique({
      where: { id: guardiaId },
      select: { id: true, tenantId: true },
    });

    if (!guardia) {
      return NextResponse.json(
        { success: false, error: "Guardia no encontrado" },
        { status: 404 },
      );
    }

    const now = new Date();

    const beneficios = await prisma.gamificacionBeneficio.findMany({
      where: {
        tenantId: guardia.tenantId,
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
        guardiaId,
        periodoTipo: "diario",
      },
      orderBy: { fechaFin: "desc" },
      select: { puntosAcumuladosHistorico: true },
    });

    const puntosDisponibles = latestScore?.puntosAcumuladosHistorico ?? 0;

    // Calculate total redeemed points to determine actually available points
    const puntosCanjeados = await prisma.gamificacionCanje.aggregate({
      where: { guardiaId },
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
