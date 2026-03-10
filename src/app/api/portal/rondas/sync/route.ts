import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import { marcarCheckpoint, MarcarCheckpointError } from "@/lib/rondas/marcar-checkpoint-service";

// ---------------------------------------------------------------------------
// Inline validation — individual mark payload (same shape as /marcar body)
// ---------------------------------------------------------------------------

const markSchema = z.object({
  ejecucionId: z.string().min(1),
  checkpointId: z.string().optional(),
  checkpointQrCode: z.string().optional(),
  lat: z.number(),
  lng: z.number(),
  guardiaId: z.string().min(1),
  batteryLevel: z.number().nullable().optional(),
  motionData: z.record(z.string(), z.unknown()).nullable().optional(),
  fotoEvidenciaUrl: z.string().nullable().optional(),
  note: z.string().nullable().optional(),
  verificationMethod: z.string().optional(),
  clientHash: z.string().optional(),
  clientTimestamp: z.string().optional(),
  gpsAccuracy: z.number().optional(),
}).refine((d) => d.checkpointId || d.checkpointQrCode, {
  message: "checkpointId o checkpointQrCode es requerido",
});

const syncBodySchema = z.object({
  marks: z.array(markSchema).min(1).max(200),
});

// ---------------------------------------------------------------------------
// POST handler — batch sync of offline checkpoint marks
// ---------------------------------------------------------------------------

export async function POST(request: NextRequest) {
  try {
    const raw = await request.json();
    const parsed = syncBodySchema.safeParse(raw);
    if (!parsed.success) {
      return NextResponse.json(
        { success: false, error: parsed.error.issues.map((i) => i.message).join("; ") },
        { status: 400 },
      );
    }

    const { marks } = parsed.data;
    let synced = 0;
    const errors: string[] = [];

    for (const mark of marks) {
      try {
        // Parse client timestamp for offline marks
        let timestamp: Date | null = null;
        if (mark.clientTimestamp) {
          const ts = new Date(mark.clientTimestamp);
          const ageMs = Date.now() - ts.getTime();
          if (!isNaN(ts.getTime()) && ageMs >= -60_000 && ageMs <= 48 * 3600_000) {
            timestamp = ts;
          }
        }

        await marcarCheckpoint({
          ejecucionId: mark.ejecucionId,
          checkpointId: mark.checkpointId,
          checkpointQrCode: mark.checkpointQrCode,
          lat: mark.lat,
          lng: mark.lng,
          gpsAccuracy: mark.gpsAccuracy,
          batteryLevel: mark.batteryLevel,
          motionData: mark.motionData,
          fotoEvidenciaUrl: mark.fotoEvidenciaUrl,
          note: mark.note,
          verificationMethod: mark.verificationMethod,
          isOfflineSync: true,
          guardiaId: mark.guardiaId,
          timestamp,
        });
        synced++;
      } catch (err) {
        const msg = err instanceof Error ? err.message : "Error desconocido";
        errors.push(`${mark.checkpointId ?? mark.checkpointQrCode ?? "?"}: ${msg}`);
      }
    }

    return NextResponse.json({
      success: true,
      data: { synced, failed: marks.length - synced, errors },
    });
  } catch (error) {
    console.error("[Portal Rondas] sync error:", error);
    return NextResponse.json({ success: false, error: "Error interno" }, { status: 500 });
  }
}
