import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";

export async function GET(request: NextRequest) {
  try {
    const { searchParams } = new URL(request.url);
    const guardiaId = searchParams.get("guardiaId");
    const page = Math.max(1, parseInt(searchParams.get("page") ?? "1", 10));
    const limit = Math.min(100, Math.max(1, parseInt(searchParams.get("limit") ?? "20", 10)));

    if (!guardiaId) {
      return NextResponse.json(
        { success: false, error: "guardiaId es requerido" },
        { status: 400 },
      );
    }

    const skip = (page - 1) * limit;

    const [eventos, total] = await Promise.all([
      prisma.gamificacionEvento.findMany({
        where: { guardiaId },
        orderBy: { fecha: "desc" },
        skip,
        take: limit,
        select: {
          id: true,
          tipo: true,
          dimension: true,
          puntos: true,
          descripcion: true,
          fecha: true,
          referenciaModelo: true,
          referenciaId: true,
        },
      }),
      prisma.gamificacionEvento.count({
        where: { guardiaId },
      }),
    ]);

    const totalPages = Math.ceil(total / limit);

    return NextResponse.json({
      success: true,
      data: eventos,
      pagination: {
        page,
        limit,
        total,
        totalPages,
      },
    });
  } catch (error) {
    console.error("[Portal Guardia] Gamification historial error:", error);
    return NextResponse.json(
      { success: false, error: "Error al obtener historial" },
      { status: 500 },
    );
  }
}
