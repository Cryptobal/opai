import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";

// UUID regex for validation
const UUID_REGEX = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

export async function POST(request: NextRequest) {
  try {
    const body = await request.json();
    const { ejecucionId, guardiaId, lat, lng, accuracy, battery } = body;

    // Validate required fields
    if (!ejecucionId || !guardiaId || lat === undefined || lng === undefined) {
      return NextResponse.json(
        { error: "Missing required fields" },
        { status: 400 }
      );
    }

    // Validate UUID format
    if (!UUID_REGEX.test(ejecucionId) || !UUID_REGEX.test(guardiaId)) {
      return NextResponse.json(
        { error: "Invalid ejecucionId or guardiaId format" },
        { status: 400 }
      );
    }

    // Validate lat/lng are numbers
    if (typeof lat !== "number" || typeof lng !== "number") {
      return NextResponse.json(
        { error: "lat and lng must be numbers" },
        { status: 400 }
      );
    }

    // Verify execution exists and is en_curso
    const execution = await prisma.opsRondaEjecucion.findFirst({
      where: {
        id: ejecucionId,
        guardiaId,
        status: "en_curso",
      },
      select: {
        id: true,
      },
    });

    if (!execution) {
      return NextResponse.json(
        { error: "Execution not found or not in progress" },
        { status: 404 }
      );
    }

    // Create tracking record
    await prisma.opsRondaTracking.create({
      data: {
        ejecucionId,
        lat,
        lng,
        accuracy: accuracy ?? null,
        battery: typeof battery === "number" ? battery : null,
      },
    });

    return NextResponse.json({ success: true });
  } catch (error) {
    console.error("[TRACKING] Error:", error);
    return NextResponse.json(
      { error: "Internal server error" },
      { status: 500 }
    );
  }
}
