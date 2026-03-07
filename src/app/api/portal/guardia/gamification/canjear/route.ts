import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { getGamificacionConfig, registrarEvento } from "@/lib/gamification";

export async function POST(request: NextRequest) {
  try {
    const body = await request.json();
    const { guardiaId, beneficioId } = body;

    if (!guardiaId) {
      return NextResponse.json(
        { success: false, error: "guardiaId es requerido" },
        { status: 400 },
      );
    }

    if (!beneficioId) {
      return NextResponse.json(
        { success: false, error: "beneficioId es requerido" },
        { status: 400 },
      );
    }

    // Get the guard
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

    // Get the benefit
    const beneficio = await prisma.gamificacionBeneficio.findUnique({
      where: { id: beneficioId },
    });

    if (!beneficio || beneficio.tenantId !== guardia.tenantId) {
      return NextResponse.json(
        { success: false, error: "Beneficio no encontrado" },
        { status: 404 },
      );
    }

    // Validate benefit is active
    if (!beneficio.activo) {
      return NextResponse.json(
        { success: false, error: "Este beneficio ya no está activo" },
        { status: 400 },
      );
    }

    // Validate availability dates
    const now = new Date();
    if (beneficio.fechaInicio && beneficio.fechaInicio > now) {
      return NextResponse.json(
        { success: false, error: "Este beneficio aún no está disponible" },
        { status: 400 },
      );
    }
    if (beneficio.fechaFin && beneficio.fechaFin < now) {
      return NextResponse.json(
        { success: false, error: "Este beneficio ya expiró" },
        { status: 400 },
      );
    }

    // Validate stock
    if (beneficio.stockDisponible !== null && beneficio.stockDisponible <= 0) {
      return NextResponse.json(
        { success: false, error: "No hay stock disponible" },
        { status: 400 },
      );
    }

    const costoPuntos = beneficio.costoPuntos ?? 0;

    // Calculate available points
    const latestScore = await prisma.gamificacionScoreGuardia.findFirst({
      where: {
        guardiaId,
        periodoTipo: "diario",
      },
      orderBy: { fechaFin: "desc" },
      select: { puntosAcumuladosHistorico: true },
    });

    const puntosAcumulados = latestScore?.puntosAcumuladosHistorico ?? 0;

    // Subtract already redeemed points
    const puntosCanjeados = await prisma.gamificacionCanje.aggregate({
      where: { guardiaId },
      _sum: { puntosUsados: true },
    });

    const puntosUsados = puntosCanjeados._sum.puntosUsados ?? 0;
    const saldoPuntos = puntosAcumulados - puntosUsados;

    if (saldoPuntos < costoPuntos) {
      return NextResponse.json(
        {
          success: false,
          error: `Puntos insuficientes. Necesitas ${costoPuntos} pero tienes ${saldoPuntos}`,
        },
        { status: 400 },
      );
    }

    // Get gamification config
    const config = await getGamificacionConfig(guardia.tenantId);
    if (!config) {
      return NextResponse.json(
        { success: false, error: "Gamificación no configurada" },
        { status: 404 },
      );
    }

    // Create the redemption and decrement stock in a transaction
    const canje = await prisma.$transaction(async (tx) => {
      // Create the canje record
      const nuevoCanje = await tx.gamificacionCanje.create({
        data: {
          tenantId: guardia.tenantId,
          guardiaId,
          beneficioId,
          puntosUsados: costoPuntos,
          status: "pendiente",
        },
      });

      // Decrement stock if tracked
      if (beneficio.stockDisponible !== null) {
        await tx.gamificacionBeneficio.update({
          where: { id: beneficioId },
          data: {
            stockDisponible: { decrement: 1 },
          },
        });
      }

      return nuevoCanje;
    });

    // Register a negative event for the points deduction (outside transaction since it's non-critical)
    await registrarEvento(
      {
        guardiaId,
        tenantId: guardia.tenantId,
        installationId: guardia.currentInstallationId,
        tipo: "canje",
        dimension: "bonus",
        descripcion: `Canje de beneficio: ${beneficio.nombre} (-${costoPuntos} pts)`,
        referenciaModelo: "GamificacionCanje",
        referenciaId: canje.id,
      },
      config,
      -costoPuntos, // Negative points as override
    );

    return NextResponse.json({
      success: true,
      data: {
        id: canje.id,
        beneficio: beneficio.nombre,
        puntosUsados: costoPuntos,
        saldoRestante: saldoPuntos - costoPuntos,
      },
    });
  } catch (error) {
    console.error("[Portal Guardia] Gamification canjear error:", error);
    return NextResponse.json(
      { success: false, error: "Error al canjear beneficio" },
      { status: 500 },
    );
  }
}
