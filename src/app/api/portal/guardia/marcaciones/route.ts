import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import type { GuardMarcacion } from "@/lib/guard-portal";

export async function GET(request: NextRequest) {
  try {
    const { searchParams } = new URL(request.url);
    const guardiaId = searchParams.get("guardiaId");
    const limit = Math.min(100, Math.max(1, parseInt(searchParams.get("limit") ?? "20", 10)));

    if (!guardiaId) {
      return NextResponse.json(
        { success: false, error: "guardiaId es requerido" },
        { status: 400 },
      );
    }

    const marcaciones = await prisma.opsMarcacion.findMany({
      where: { guardiaId },
      include: {
        installation: { select: { name: true } },
      },
      orderBy: { timestamp: "desc" },
      take: limit,
    });

    const data: GuardMarcacion[] = marcaciones.map((m) => ({
      id: m.id,
      type: m.tipo as "entrada" | "salida",
      timestamp: m.timestamp instanceof Date ? m.timestamp.toISOString() : String(m.timestamp),
      installationName: m.installation?.name ?? "Sin instalación",
      geoValidated: m.geoValidada,
      geoDistanceM: m.geoDistanciaM ?? null,
    }));

    return NextResponse.json({ success: true, data });
  } catch (error) {
    console.error("[Portal Guardia] Marcaciones error:", error);
    return NextResponse.json(
      { success: false, error: "Error al obtener marcaciones" },
      { status: 500 },
    );
  }
}
