import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { requireAuth, unauthorized, resolveApiPerms, parseBody } from "@/lib/api-auth";
import { canEdit } from "@/lib/permissions";
import { z } from "zod";

const startTripSchema = z.object({
  startLat: z.number().min(-90).max(90),
  startLng: z.number().min(-180).max(180),
  startAddress: z.string().max(500).nullish(),
});

// ── POST: start a trip (check-in) ──

export async function POST(request: NextRequest) {
  try {
    const ctx = await requireAuth();
    if (!ctx) return unauthorized();
    const perms = await resolveApiPerms(ctx);

    if (!canEdit(perms, "finance", "rendiciones")) {
      return NextResponse.json(
        { success: false, error: "Sin permisos para crear viajes" },
        { status: 403 },
      );
    }

    const parsed = await parseBody(request, startTripSchema);
    if (parsed.error) return parsed.error;
    const body = parsed.data;

    // Fetch config for snapshot parameters
    const config = await prisma.financeRendicionConfig.findUnique({
      where: { tenantId: ctx.tenantId },
    });

    const snapshotKmPerLiter = config ? Number(config.kmPerLiter) : 10;
    const snapshotFuelPrice = config?.fuelPricePerLiter ?? 1500;
    const snapshotFeePct = config ? Number(config.vehicleFeePct) : 10;

    // Check for active trips
    const activeTrip = await prisma.financeTrip.findFirst({
      where: {
        tenantId: ctx.tenantId,
        submitterId: ctx.userId,
        status: "IN_PROGRESS",
      },
    });

    if (activeTrip) {
      return NextResponse.json(
        { success: false, error: "Ya tienes un viaje en progreso. Finalízalo antes de iniciar uno nuevo." },
        { status: 400 },
      );
    }

    const trip = await prisma.financeTrip.create({
      data: {
        tenantId: ctx.tenantId,
        submitterId: ctx.userId,
        startLat: body.startLat,
        startLng: body.startLng,
        startAddress: body.startAddress ?? null,
        startedAt: new Date(),
        status: "IN_PROGRESS",
        snapshotKmPerLiter,
        snapshotFuelPrice,
        snapshotFeePct,
      },
    });

    return NextResponse.json({ success: true, data: trip }, { status: 201 });
  } catch (error) {
    console.error("[Finance] Error starting trip:", error);
    return NextResponse.json(
      { success: false, error: "No se pudo iniciar el viaje" },
      { status: 500 },
    );
  }
}
