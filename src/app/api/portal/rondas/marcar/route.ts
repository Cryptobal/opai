import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { marcarCheckpoint, MarcarCheckpointError } from "@/lib/rondas/marcar-checkpoint-service";

export async function POST(request: NextRequest) {
  try {
    const body = await request.json();
    const {
      ejecucionId,
      checkpointId,
      checkpointQrCode,
      lat,
      lng,
      gpsAccuracy,
      batteryLevel,
      motionData,
      fotoEvidenciaUrl,
      note,
      verificationMethod,
      isOfflineSync,
      guardiaId,
      taskResponses,
    } = body as {
      ejecucionId?: string;
      checkpointId?: string;
      checkpointQrCode?: string;
      lat?: number;
      lng?: number;
      gpsAccuracy?: number | null;
      batteryLevel?: number | null;
      motionData?: Record<string, unknown> | null;
      fotoEvidenciaUrl?: string | null;
      note?: string | null;
      verificationMethod?: string;
      isOfflineSync?: boolean;
      guardiaId?: string;
      taskResponses?: Array<{ taskId: string; value: unknown; photoUrls?: string[] }>;
    };

    // Inline validation for required fields
    if (!ejecucionId || typeof ejecucionId !== "string") {
      return NextResponse.json({ success: false, error: "ejecucionId es requerido" }, { status: 400 });
    }
    if (lat == null || typeof lat !== "number") {
      return NextResponse.json({ success: false, error: "lat es requerido" }, { status: 400 });
    }
    if (lng == null || typeof lng !== "number") {
      return NextResponse.json({ success: false, error: "lng es requerido" }, { status: 400 });
    }
    if (!guardiaId || typeof guardiaId !== "string") {
      return NextResponse.json({ success: false, error: "guardiaId es requerido" }, { status: 400 });
    }

    // Validate that ejecucion belongs to the same tenant as the guard
    const guardia = await prisma.opsGuardia.findUnique({
      where: { id: guardiaId },
      select: { tenantId: true },
    });
    if (!guardia) {
      return NextResponse.json({ success: false, error: "Guardia no encontrado" }, { status: 404 });
    }
    const ejecucion = await prisma.opsRondaEjecucion.findFirst({
      where: { id: ejecucionId, tenantId: guardia.tenantId },
      select: { id: true },
    });
    if (!ejecucion) {
      return NextResponse.json({ success: false, error: "Ejecución no encontrada" }, { status: 404 });
    }

    const result = await marcarCheckpoint({
      ejecucionId,
      checkpointId,
      checkpointQrCode,
      lat,
      lng,
      gpsAccuracy,
      batteryLevel,
      motionData,
      fotoEvidenciaUrl,
      note,
      verificationMethod,
      isOfflineSync,
      guardiaId,
      taskResponses,
    });

    return NextResponse.json({ success: true, data: result });
  } catch (error) {
    if (error instanceof MarcarCheckpointError) {
      if (error.code === "already_marked") {
        return NextResponse.json({ success: true, already_marked: true }, { status: 200 });
      }
      return NextResponse.json({ success: false, error: error.message }, { status: error.statusCode });
    }
    console.error("[Portal Rondas] marcar checkpoint error:", error);
    return NextResponse.json({ success: false, error: "Error interno" }, { status: 500 });
  }
}
