import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { requireAuth, unauthorized, resolveApiPerms, parseBody } from "@/lib/api-auth";
import { canEdit } from "@/lib/permissions";
import { z } from "zod";
import { roadDistanceKm, mileageBreakdown } from "@/lib/finance/mileage";

type Params = { id: string };

const routePointSchema = z.object({
  lat: z.number(),
  lng: z.number(),
  ts: z.number(),
});

const endTripSchema = z.object({
  endLat: z.number().min(-90).max(90),
  endLng: z.number().min(-180).max(180),
  endAddress: z.string().max(500).nullish(),
  tollAmount: z.number().int().min(0).optional(),
  routePoints: z.array(routePointSchema).max(5000).optional(),
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

    // Distancia por carretera (cae a línea recta si Google falla — nunca 0 silencioso)
    const startLat = Number(trip.startLat);
    const startLng = Number(trip.startLng);
    const { endLat, endLng } = body;

    const { distanceKm } = await roadDistanceKm(startLat, startLng, endLat, endLng);

    // Cálculo de costos — misma fórmula que el preview (/estimate)
    const snapshotKmPerLiter = Number(trip.snapshotKmPerLiter ?? 10);
    const snapshotFuelPrice = trip.snapshotFuelPrice ?? 1500;
    const snapshotFeePct = Number(trip.snapshotFeePct ?? 10);
    const tollAmount = body.tollAmount ?? trip.tollAmount ?? 0;

    const { litersConsumed, fuelCost, vehicleFee, subtotal, totalAmount } = (() => {
      const b = mileageBreakdown({
        distanceKm,
        kmPerLiter: snapshotKmPerLiter,
        fuelPricePerLiter: snapshotFuelPrice,
        vehicleFeePct: snapshotFeePct,
        tollAmount,
      });
      return {
        litersConsumed: b.liters,
        fuelCost: b.fuelCost,
        vehicleFee: b.vehicleFee,
        subtotal: b.subtotal,
        totalAmount: b.totalAmount,
      };
    })();

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
          tollAmount,
          totalAmount,
          routePoints: body.routePoints ?? undefined,
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
