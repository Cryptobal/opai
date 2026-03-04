import { NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";

export async function POST(req: Request) {
  try {
    const body = await req.json();
    const {
      tenantId,
      guardiaId,
      installationId,
      ejecucionId,
      checkpointId,
      tipo,
      descripcion,
      fotoUrl,
      lat,
      lng,
    } = body as {
      tenantId?: string;
      guardiaId?: string;
      installationId?: string;
      ejecucionId?: string;
      checkpointId?: string;
      tipo?: string;
      descripcion?: string;
      fotoUrl?: string;
      lat?: number;
      lng?: number;
    };

    if (!tenantId || !guardiaId || !tipo || !descripcion) {
      return NextResponse.json(
        { success: false, error: "Campos requeridos faltantes" },
        { status: 400 }
      );
    }

    const incidente = await prisma.opsRondaIncidente.create({
      data: {
        tenantId,
        guardiaId,
        installationId: installationId || undefined,
        ejecucionId: ejecucionId || undefined,
        checkpointId: checkpointId || undefined,
        tipo,
        descripcion,
        fotoUrl: fotoUrl || undefined,
        lat: lat ?? undefined,
        lng: lng ?? undefined,
        status: "abierto",
      },
    });

    return NextResponse.json({
      success: true,
      data: { id: incidente.id },
    });
  } catch (error) {
    console.error("[Portal Rondas] Incidente error:", error);
    return NextResponse.json(
      { success: false, error: "Error al crear incidente" },
      { status: 500 }
    );
  }
}
