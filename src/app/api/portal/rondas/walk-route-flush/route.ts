import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";

const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

/**
 * POST /api/portal/rondas/walk-route-flush
 *
 * Persists the accumulated GPS trail from the guard's device to the database.
 * Called every 60 s from RondaActiva so the trail survives automatic closures.
 * The client sends the FULL accumulated trail; we replace walkRoute atomically.
 * Works for both free rounds (isAdHoc) and programmed rounds.
 */
export async function POST(request: NextRequest) {
  try {
    const body = await request.json();
    const { ejecucionId, guardiaId, points } = body as {
      ejecucionId?: string;
      guardiaId?: string;
      points?: Array<{ lat: number; lng: number }>;
    };

    if (!ejecucionId || !guardiaId || !Array.isArray(points)) {
      return NextResponse.json({ error: "Missing required fields" }, { status: 400 });
    }

    if (!UUID_RE.test(ejecucionId) || !UUID_RE.test(guardiaId)) {
      return NextResponse.json({ error: "Invalid ejecucionId or guardiaId format" }, { status: 400 });
    }

    if (points.length === 0) {
      return NextResponse.json({ success: true, saved: 0 });
    }

    // Validate points shape (lat/lng must be numbers)
    const validPoints = points.filter(
      (p) =>
        p &&
        typeof p.lat === "number" &&
        typeof p.lng === "number" &&
        !isNaN(p.lat) &&
        !isNaN(p.lng),
    );

    if (validPoints.length === 0) {
      return NextResponse.json({ success: true, saved: 0 });
    }

    // Only update if round is still active (en_curso) to avoid mutating completed rounds
    const updated = await prisma.opsRondaEjecucion.updateMany({
      where: {
        id: ejecucionId,
        guardiaId,
        status: "en_curso",
      },
      data: {
        walkRoute: validPoints as never,
      },
    });

    return NextResponse.json({ success: true, saved: updated.count > 0 ? validPoints.length : 0 });
  } catch (error) {
    console.error("[WALK_ROUTE_FLUSH] Error:", error);
    return NextResponse.json({ error: "Internal server error" }, { status: 500 });
  }
}
