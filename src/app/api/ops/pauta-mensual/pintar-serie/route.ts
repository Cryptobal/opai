import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { parseBody, requireAuth, unauthorized } from "@/lib/api-auth";
import { pintarSerieSchema } from "@/lib/validations/ops";
import {
  createOpsAuditLog,
  ensureOpsAccess,
  getMonthDateRange,
  listDatesBetween,
  parseDateOnly,
} from "@/lib/ops";

/**
 * Generates shift codes for a month based on a rotation pattern.
 *
 * @param startDate - When this assignment begins (the day the user clicked)
 * @param startPosition - 1-based position in the cycle on startDate
 * @param patternWork - Number of work days in the cycle
 * @param patternOff - Number of off days in the cycle
 * @param monthDates - All dates of the month
 * @returns Array of { date, shiftCode } for each day
 */
function generateSerieForMonth(
  startDate: Date,
  startPosition: number,
  patternWork: number,
  patternOff: number,
  monthDates: Date[]
): { date: Date; shiftCode: string }[] {
  const cycleLength = patternWork + patternOff;
  const results: { date: Date; shiftCode: string }[] = [];

  for (const d of monthDates) {
    const diffMs = d.getTime() - startDate.getTime();
    const daysDiff = Math.round(diffMs / (1000 * 60 * 60 * 24));

    // Position in cycle: adjust by startPosition (0-based internally)
    let positionInCycle =
      ((daysDiff + (startPosition - 1)) % cycleLength + cycleLength) % cycleLength;

    const isWorkDay = positionInCycle < patternWork;

    results.push({
      date: new Date(d),
      shiftCode: isWorkDay ? "T" : "-",
    });
  }

  return results;
}

export async function POST(request: NextRequest) {
  try {
    const ctx = await requireAuth();
    if (!ctx) return unauthorized();
    const forbidden = ensureOpsAccess(ctx);
    if (forbidden) return forbidden;

    const parsed = await parseBody(request, pintarSerieSchema);
    if (parsed.error) return parsed.error;
    const body = parsed.data;

    // Validate puesto exists
    const puesto = await prisma.opsPuestoOperativo.findFirst({
      where: { id: body.puestoId, tenantId: ctx.tenantId },
      select: { id: true, installationId: true, requiredGuards: true },
    });
    if (!puesto) {
      return NextResponse.json(
        { success: false, error: "Puesto operativo no encontrado" },
        { status: 404 }
      );
    }
    if (body.slotNumber > puesto.requiredGuards) {
      return NextResponse.json(
        { success: false, error: `Slot ${body.slotNumber} excede dotación del puesto (${puesto.requiredGuards})` },
        { status: 400 }
      );
    }

    // Validate guardia
    const guardia = await prisma.opsGuardia.findFirst({
      where: { id: body.guardiaId, tenantId: ctx.tenantId },
      select: { id: true, isBlacklisted: true, status: true },
    });
    if (!guardia) {
      return NextResponse.json(
        { success: false, error: "Guardia no encontrado" },
        { status: 404 }
      );
    }
    if (guardia.isBlacklisted || guardia.status !== "active") {
      return NextResponse.json(
        { success: false, error: "El guardia debe estar activo y fuera de lista negra" },
        { status: 400 }
      );
    }

    // Validate guard is assigned to this puesto+slot
    const asignacion = await prisma.opsAsignacionGuardia.findFirst({
      where: {
        tenantId: ctx.tenantId,
        guardiaId: body.guardiaId,
        puestoId: body.puestoId,
        slotNumber: body.slotNumber,
        isActive: true,
      },
    });
    if (!asignacion) {
      return NextResponse.json(
        { success: false, error: "El guardia no está asignado a este puesto/slot. Asígnalo primero en Puestos operativos." },
        { status: 400 }
      );
    }

    const startDate = parseDateOnly(body.startDate);

    // Don't allow painting before the assignment start date
    if (startDate < asignacion.startDate) {
      const assignDateStr = asignacion.startDate.toISOString().slice(0, 10);
      return NextResponse.json(
        { success: false, error: `No se puede pintar antes de la fecha de asignación (${assignDateStr}). El guardia fue asignado desde esa fecha.` },
        { status: 400 }
      );
    }

    const { start: monthStart, end: monthEnd } = getMonthDateRange(body.year, body.month);

    // Only paint from the assignment start date (or click date), not before
    const effectiveStart = asignacion.startDate > monthStart ? asignacion.startDate : monthStart;
    const paintDates = listDatesBetween(effectiveStart, monthEnd);

    // Generate the series pattern (only for dates from effectiveStart)
    const serieEntries = generateSerieForMonth(
      startDate,
      body.startPosition,
      body.patternWork,
      body.patternOff,
      paintDates
    );

    // Save the serie definition (deactivate previous ones for same puesto+slot)
    await prisma.opsSerieAsignacion.updateMany({
      where: {
        tenantId: ctx.tenantId,
        puestoId: body.puestoId,
        slotNumber: body.slotNumber,
        isActive: true,
      },
      data: { isActive: false, endDate: monthStart },
    });

    await prisma.opsSerieAsignacion.create({
      data: {
        tenantId: ctx.tenantId,
        puestoId: body.puestoId,
        slotNumber: body.slotNumber,
        guardiaId: body.guardiaId,
        patternCode: body.patternCode,
        patternWork: body.patternWork,
        patternOff: body.patternOff,
        startDate,
        startPosition: body.startPosition,
        isActive: true,
        createdBy: ctx.userId,
      },
    });

    // Update pauta entries for this slot
    let updated = 0;
    for (const entry of serieEntries) {
      try {
        await prisma.opsPautaMensual.upsert({
          where: {
            puestoId_slotNumber_date: {
              puestoId: body.puestoId,
              slotNumber: body.slotNumber,
              date: entry.date,
            },
          },
          create: {
            tenantId: ctx.tenantId,
            installationId: puesto.installationId,
            puestoId: body.puestoId,
            slotNumber: body.slotNumber,
            date: entry.date,
            plannedGuardiaId: entry.shiftCode === "T" ? body.guardiaId : null,
            shiftCode: entry.shiftCode,
            status: "planificado",
            createdBy: ctx.userId,
          },
          update: {
            plannedGuardiaId: entry.shiftCode === "T" ? body.guardiaId : null,
            shiftCode: entry.shiftCode,
          },
        });
        updated++;
      } catch (e) {
        console.error("[OPS] Error upserting pauta entry:", e);
      }
    }

    await createOpsAuditLog(ctx, "ops.pauta.serie_painted", "ops_pauta", undefined, {
      puestoId: body.puestoId,
      slotNumber: body.slotNumber,
      guardiaId: body.guardiaId,
      patternCode: body.patternCode,
      startDate: body.startDate,
      startPosition: body.startPosition,
      updatedEntries: updated,
    });

    return NextResponse.json({
      success: true,
      data: {
        updated,
        patternCode: body.patternCode,
        guardiaId: body.guardiaId,
        slotNumber: body.slotNumber,
      },
    });
  } catch (error) {
    console.error("[OPS] Error painting serie:", error);
    return NextResponse.json(
      { success: false, error: "No se pudo pintar la serie" },
      { status: 500 }
    );
  }
}
