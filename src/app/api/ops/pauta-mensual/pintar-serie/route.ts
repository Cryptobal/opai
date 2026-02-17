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
  toISODate,
} from "@/lib/ops";

/**
 * Generates shift codes for a month based on a rotation pattern.
 * Returns "T" for work days, "-" for rest days.
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

    const positionInCycle =
      ((daysDiff + (startPosition - 1)) % cycleLength + cycleLength) % cycleLength;

    const isWorkDay = positionInCycle < patternWork;

    results.push({
      date: new Date(d),
      shiftCode: isWorkDay ? "T" : "-",
    });
  }

  return results;
}

/**
 * Generates rotative shift codes for two paired puestos.
 * Odd work cycles → puesto A works, puesto B rests.
 * Even work cycles → puesto B works, puesto A rests.
 *
 * Returns entries for both puestos.
 */
function generateRotativeSerieForMonth(
  startDate: Date,
  startPosition: number,
  patternWork: number,
  patternOff: number,
  monthDates: Date[],
  startShift: "day" | "night"
): {
  puestoA: { date: Date; shiftCode: string }[];
  puestoB: { date: Date; shiftCode: string }[];
} {
  const cycleLength = patternWork + patternOff;
  const doubleCycleLength = cycleLength * 2;
  const puestoA: { date: Date; shiftCode: string }[] = [];
  const puestoB: { date: Date; shiftCode: string }[] = [];

  for (const d of monthDates) {
    const diffMs = d.getTime() - startDate.getTime();
    const daysDiff = Math.round(diffMs / (1000 * 60 * 60 * 24));

    const positionInDoubleCycle =
      ((daysDiff + (startPosition - 1)) % doubleCycleLength + doubleCycleLength) % doubleCycleLength;

    // First cycle (0..cycleLength-1): work first half, rest second half
    // Second cycle (cycleLength..doubleCycleLength-1): same pattern but for the other puesto
    const isFirstCycle = positionInDoubleCycle < cycleLength;
    const positionInCycle = isFirstCycle
      ? positionInDoubleCycle
      : positionInDoubleCycle - cycleLength;
    const isWorkDay = positionInCycle < patternWork;

    // startShift determines which puesto gets the first cycle
    // "day" → puesto A (the one the user clicked) gets cycle 1
    // "night" → puesto B (the rotate puesto) gets cycle 1
    if (startShift === "day") {
      puestoA.push({ date: new Date(d), shiftCode: isFirstCycle && isWorkDay ? "T" : "-" });
      puestoB.push({ date: new Date(d), shiftCode: !isFirstCycle && isWorkDay ? "T" : "-" });
    } else {
      puestoA.push({ date: new Date(d), shiftCode: !isFirstCycle && isWorkDay ? "T" : "-" });
      puestoB.push({ date: new Date(d), shiftCode: isFirstCycle && isWorkDay ? "T" : "-" });
    }
  }

  return { puestoA, puestoB };
}

/**
 * Upserts pauta entries for a set of serie entries.
 */
async function upsertPautaEntries(
  entries: { date: Date; shiftCode: string }[],
  puestoId: string,
  slotNumber: number,
  installationId: string,
  tenantId: string,
  userId: string,
  asignacion: { guardiaId: string; startDate: Date } | null
): Promise<number> {
  let updated = 0;
  for (const entry of entries) {
    const dateOnly = parseDateOnly(toISODate(entry.date));
    let plannedGuardiaId: string | null = null;
    if (entry.shiftCode === "T" && asignacion && dateOnly >= asignacion.startDate) {
      plannedGuardiaId = asignacion.guardiaId;
    }
    await prisma.opsPautaMensual.upsert({
      where: {
        puestoId_slotNumber_date: {
          puestoId,
          slotNumber,
          date: dateOnly,
        },
      },
      create: {
        tenantId,
        installationId,
        puestoId,
        slotNumber,
        date: dateOnly,
        plannedGuardiaId,
        shiftCode: entry.shiftCode,
        status: "planificado",
        createdBy: userId,
      },
      update: {
        plannedGuardiaId,
        shiftCode: entry.shiftCode,
      },
    });
    updated++;
  }
  return updated;
}

export async function POST(request: NextRequest) {
  try {
    const ctx = await requireAuth();
    if (!ctx) return unauthorized();
    const forbidden = await ensureOpsAccess(ctx);
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

    // Check if there's a guard assigned to this slot
    const asignacion = await prisma.opsAsignacionGuardia.findFirst({
      where: {
        tenantId: ctx.tenantId,
        puestoId: body.puestoId,
        slotNumber: body.slotNumber,
        isActive: true,
      },
      select: { guardiaId: true, startDate: true },
    });

    const startDate = parseDateOnly(body.startDate);
    const { start: monthStart, end: monthEnd } = getMonthDateRange(body.year, body.month);
    const paintDates = listDatesBetween(monthStart, monthEnd);

    // ── ROTATIVE SHIFT ──
    if (body.isRotativo && body.rotatePuestoId && body.rotateSlotNumber && body.startShift) {
      // Validate the rotate puesto exists and belongs to same installation
      const rotatePuesto = await prisma.opsPuestoOperativo.findFirst({
        where: { id: body.rotatePuestoId, tenantId: ctx.tenantId, installationId: puesto.installationId },
        select: { id: true, installationId: true, requiredGuards: true },
      });
      if (!rotatePuesto) {
        return NextResponse.json(
          { success: false, error: "Puesto par (rotativo) no encontrado en la misma instalación" },
          { status: 404 }
        );
      }
      if (body.rotateSlotNumber > rotatePuesto.requiredGuards) {
        return NextResponse.json(
          { success: false, error: `Slot ${body.rotateSlotNumber} excede dotación del puesto par (${rotatePuesto.requiredGuards})` },
          { status: 400 }
        );
      }

      // Check assignment on rotate puesto
      const rotateAsignacion = await prisma.opsAsignacionGuardia.findFirst({
        where: {
          tenantId: ctx.tenantId,
          puestoId: body.rotatePuestoId,
          slotNumber: body.rotateSlotNumber,
          isActive: true,
        },
        select: { guardiaId: true, startDate: true },
      });

      // Generate rotative entries
      const { puestoA, puestoB } = generateRotativeSerieForMonth(
        startDate,
        body.startPosition,
        body.patternWork,
        body.patternOff,
        paintDates,
        body.startShift
      );

      // Deactivate previous series for both puestos
      await prisma.opsSerieAsignacion.updateMany({
        where: {
          tenantId: ctx.tenantId,
          puestoId: body.puestoId,
          slotNumber: body.slotNumber,
          isActive: true,
        },
        data: { isActive: false, endDate: monthStart },
      });
      await prisma.opsSerieAsignacion.updateMany({
        where: {
          tenantId: ctx.tenantId,
          puestoId: body.rotatePuestoId,
          slotNumber: body.rotateSlotNumber,
          isActive: true,
        },
        data: { isActive: false, endDate: monthStart },
      });

      // Create linked series (A → B and B → A)
      const baseSerieData = {
        tenantId: ctx.tenantId,
        patternCode: body.patternCode,
        patternWork: body.patternWork,
        patternOff: body.patternOff,
        startDate,
        startPosition: body.startPosition,
        isActive: true,
        isRotativo: true,
        createdBy: ctx.userId,
      };

      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      const serieA = await (prisma.opsSerieAsignacion.create as any)({
        data: {
          ...baseSerieData,
          puestoId: body.puestoId,
          slotNumber: body.slotNumber,
          guardiaId: asignacion?.guardiaId ?? null,
          rotatePuestoId: body.rotatePuestoId,
          rotateSlotNumber: body.rotateSlotNumber,
          startShift: body.startShift,
        },
      });

      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      const serieB = await (prisma.opsSerieAsignacion.create as any)({
        data: {
          ...baseSerieData,
          puestoId: body.rotatePuestoId,
          slotNumber: body.rotateSlotNumber,
          guardiaId: rotateAsignacion?.guardiaId ?? asignacion?.guardiaId ?? null,
          rotatePuestoId: body.puestoId,
          rotateSlotNumber: body.slotNumber,
          startShift: body.startShift === "day" ? "night" : "day",
          linkedSerieId: serieA.id,
        },
      });

      // Link A → B
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      await (prisma.opsSerieAsignacion.update as any)({
        where: { id: serieA.id },
        data: { linkedSerieId: serieB.id },
      });

      // Upsert pauta entries for both puestos
      const updatedA = await upsertPautaEntries(
        puestoA, body.puestoId, body.slotNumber,
        puesto.installationId, ctx.tenantId, ctx.userId,
        asignacion ? { guardiaId: asignacion.guardiaId, startDate: asignacion.startDate } : null
      );
      const updatedB = await upsertPautaEntries(
        puestoB, body.rotatePuestoId, body.rotateSlotNumber,
        puesto.installationId, ctx.tenantId, ctx.userId,
        rotateAsignacion ? { guardiaId: rotateAsignacion.guardiaId, startDate: rotateAsignacion.startDate } :
          asignacion ? { guardiaId: asignacion.guardiaId, startDate: asignacion.startDate } : null
      );

      await createOpsAuditLog(ctx, "ops.pauta.serie_rotativa_painted", "ops_pauta", undefined, {
        puestoId: body.puestoId,
        slotNumber: body.slotNumber,
        rotatePuestoId: body.rotatePuestoId,
        rotateSlotNumber: body.rotateSlotNumber,
        startShift: body.startShift,
        patternCode: body.patternCode,
        startDate: body.startDate,
        startPosition: body.startPosition,
        updatedA,
        updatedB,
      });

      return NextResponse.json({
        success: true,
        data: {
          updated: updatedA + updatedB,
          patternCode: body.patternCode,
          isRotativo: true,
          guardiaId: asignacion?.guardiaId ?? null,
          slotNumber: body.slotNumber,
          rotatePuestoId: body.rotatePuestoId,
          rotateSlotNumber: body.rotateSlotNumber,
        },
      });
    }

    // ── STANDARD (non-rotative) SHIFT — unchanged logic ──
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

    const serieCreateData: Record<string, unknown> = {
      tenantId: ctx.tenantId,
      puestoId: body.puestoId,
      slotNumber: body.slotNumber,
      patternCode: body.patternCode,
      patternWork: body.patternWork,
      patternOff: body.patternOff,
      startDate,
      startPosition: body.startPosition,
      isActive: true,
      isRotativo: false,
      createdBy: ctx.userId,
    };
    if (asignacion?.guardiaId) {
      serieCreateData.guardiaId = asignacion.guardiaId;
    }
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    await (prisma.opsSerieAsignacion.create as any)({ data: serieCreateData });

    const updated = await upsertPautaEntries(
      serieEntries, body.puestoId, body.slotNumber,
      puesto.installationId, ctx.tenantId, ctx.userId,
      asignacion ? { guardiaId: asignacion.guardiaId, startDate: asignacion.startDate } : null
    );

    await createOpsAuditLog(ctx, "ops.pauta.serie_painted", "ops_pauta", undefined, {
      puestoId: body.puestoId,
      slotNumber: body.slotNumber,
      guardiaId: asignacion?.guardiaId ?? null,
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
        guardiaId: asignacion?.guardiaId ?? null,
        slotNumber: body.slotNumber,
      },
    });
  } catch (error) {
    const message = error instanceof Error ? error.message : "No se pudo pintar la serie";
    console.error("[OPS] Error painting serie:", error);
    return NextResponse.json(
      { success: false, error: message },
      { status: 500 }
    );
  }
}
