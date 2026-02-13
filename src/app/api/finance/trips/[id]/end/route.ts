import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { requireAuth, unauthorized, resolveApiPerms, parseBody } from "@/lib/api-auth";
import { canEdit } from "@/lib/permissions";
import { z } from "zod";

type Params = { id: string };

const endTripSchema = z.object({
  endLat: z.number().min(-90).max(90),
  endLng: z.number().min(-180).max(180),
  endAddress: z.string().max(500).nullish(),
});

// ── POST: end trip (check-out) ──

export async function POST(
  request: NextRequest,
  { params }: { params: Promise<Params> },
) {
  try {
    const ctx = await requireAuth();
    if (!ctx) return unauthorized();
    const perms = await resolveApiPerms(ctx);

    if (!canEdit(perms, "finance", "rendiciones")) {
      return NextResponse.json(
        { success: false, error: "Sin permisos para finalizar viajes" },
        { status: 403 },
      );
    }

    const { id } = await params;

    const parsed = await parseBody(request, endTripSchema);
    if (parsed.error) return parsed.error;
    const body = parsed.data;

    const trip = await prisma.financeTrip.findFirst({
      where: { id, tenantId: ctx.tenantId, submitterId: ctx.userId },
    });

    if (!trip) {
      return NextResponse.json(
        { success: false, error: "Viaje no encontrado" },
        { status: 404 },
      );
    }

    if (trip.status !== "IN_PROGRESS") {
      return NextResponse.json(
        { success: false, error: `Solo se puede finalizar un viaje en progreso (actual: ${trip.status})` },
        { status: 400 },
      );
    }

    // Calculate distance using Google Maps Directions API
    const startLat = Number(trip.startLat);
    const startLng = Number(trip.startLng);
    const { endLat, endLng } = body;

    let distanceKm = 0;
    try {
      const apiKey = process.env.NEXT_PUBLIC_GOOGLE_MAPS_API_KEY;
      if (!apiKey) throw new Error("Google Maps API key not configured");

      const url = `https://maps.googleapis.com/maps/api/directions/json?origin=${startLat},${startLng}&destination=${endLat},${endLng}&key=${apiKey}`;
      const response = await fetch(url);
      const data = await response.json();

      if (data.routes?.[0]?.legs?.[0]?.distance?.value) {
        distanceKm = data.routes[0].legs[0].distance.value / 1000;
      }
    } catch (err) {
      console.error("[Finance] Error fetching distance from Google Maps:", err);
      // Fall back to straight-line distance (Haversine)
      distanceKm = haversineDistance(startLat, startLng, endLat, endLng);
    }

    // Calculate costs
    const snapshotKmPerLiter = Number(trip.snapshotKmPerLiter ?? 10);
    const snapshotFuelPrice = trip.snapshotFuelPrice ?? 1500;
    const snapshotFeePct = Number(trip.snapshotFeePct ?? 10);
    const tollAmount = trip.tollAmount ?? 0;

    const litersConsumed = snapshotKmPerLiter > 0 ? distanceKm / snapshotKmPerLiter : 0;
    const fuelCost = Math.round(litersConsumed * snapshotFuelPrice);
    const vehicleFee = Math.round(fuelCost * snapshotFeePct / 100);
    const subtotal = fuelCost + vehicleFee;
    const totalAmount = subtotal + tollAmount;

    // Generate rendicion code
    const year = new Date().getFullYear();
    const prefix = `REN-${year}-`;
    const lastRendicion = await prisma.financeRendicion.findFirst({
      where: { tenantId: ctx.tenantId, code: { startsWith: prefix } },
      orderBy: { code: "desc" },
      select: { code: true },
    });
    let seq = 1;
    if (lastRendicion) {
      const lastSeq = parseInt(lastRendicion.code.replace(prefix, ""), 10);
      if (!isNaN(lastSeq)) seq = lastSeq + 1;
    }
    const code = `${prefix}${String(seq).padStart(4, "0")}`;

    const result = await prisma.$transaction(async (tx) => {
      // Update trip
      const updatedTrip = await tx.financeTrip.update({
        where: { id },
        data: {
          endLat: body.endLat,
          endLng: body.endLng,
          endAddress: body.endAddress ?? null,
          endedAt: new Date(),
          distanceKm,
          litersConsumed,
          fuelCost,
          vehicleFee,
          subtotal,
          totalAmount,
          status: "COMPLETED",
        },
      });

      // Auto-create rendicion of type MILEAGE
      const rendicion = await tx.financeRendicion.create({
        data: {
          tenantId: ctx.tenantId,
          code,
          submitterId: ctx.userId,
          type: "MILEAGE",
          status: "DRAFT",
          amount: totalAmount,
          date: new Date(),
          description: `Viaje: ${trip.startAddress ?? "origen"} → ${body.endAddress ?? "destino"} (${distanceKm.toFixed(1)} km)`,
          tripId: id,
        },
      });

      await tx.financeRendicionHistory.create({
        data: {
          rendicionId: rendicion.id,
          action: "CREATED",
          fromStatus: null,
          toStatus: "DRAFT",
          userId: ctx.userId,
          userName: ctx.userEmail,
          comment: `Creada automáticamente desde viaje (${distanceKm.toFixed(1)} km)`,
        },
      });

      return { trip: updatedTrip, rendicion };
    });

    return NextResponse.json({ success: true, data: result });
  } catch (error) {
    console.error("[Finance] Error ending trip:", error);
    return NextResponse.json(
      { success: false, error: "No se pudo finalizar el viaje" },
      { status: 500 },
    );
  }
}

/** Haversine distance in km (fallback) */
function haversineDistance(
  lat1: number,
  lon1: number,
  lat2: number,
  lon2: number,
): number {
  const R = 6371;
  const dLat = ((lat2 - lat1) * Math.PI) / 180;
  const dLon = ((lon2 - lon1) * Math.PI) / 180;
  const a =
    Math.sin(dLat / 2) ** 2 +
    Math.cos((lat1 * Math.PI) / 180) *
      Math.cos((lat2 * Math.PI) / 180) *
      Math.sin(dLon / 2) ** 2;
  return R * 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a));
}
