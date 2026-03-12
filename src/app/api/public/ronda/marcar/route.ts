import { NextRequest, NextResponse } from "next/server";
import { parseBody } from "@/lib/api-auth";
import { rondaMarkSchema } from "@/lib/validations/rondas";
import { marcarCheckpoint, MarcarCheckpointError } from "@/lib/rondas/marcar-checkpoint-service";

export async function POST(request: NextRequest) {
  try {
    console.log(`[public/ronda] POST /api/public/ronda/marcar — ${new Date().toISOString()}`);
    const parsed = await parseBody(request, rondaMarkSchema);
    if (parsed.error) return parsed.error;

    const result = await marcarCheckpoint({
      ejecucionId: parsed.data.executionId,
      checkpointId: parsed.data.checkpointId,
      checkpointQrCode: parsed.data.checkpointQrCode,
      lat: parsed.data.lat,
      lng: parsed.data.lng,
      gpsAccuracy: parsed.data.gpsAccuracy,
      batteryLevel: parsed.data.batteryLevel,
      motionData: parsed.data.motionData,
      fotoEvidenciaUrl: parsed.data.fotoEvidenciaUrl,
      audioUrl: parsed.data.audioUrl,
      note: parsed.data.note,
      verificationMethod: parsed.data.verificationMethod,
      isOfflineSync: parsed.data.isOfflineSync,
      // guardiaId omitted — service uses execution.guardiaId
    });

    return NextResponse.json({ success: true, data: result });
  } catch (error) {
    if (error instanceof MarcarCheckpointError) {
      if (error.code === "already_marked") {
        return NextResponse.json({ success: true, already_marked: true }, { status: 200 });
      }
      return NextResponse.json({ success: false, error: error.message }, { status: error.statusCode });
    }
    console.error("[RONDAS] public marcar", error);
    return NextResponse.json({ success: false, error: "Error interno" }, { status: 500 });
  }
}
