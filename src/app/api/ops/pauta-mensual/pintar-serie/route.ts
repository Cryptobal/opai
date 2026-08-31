import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { parseBody, requireAuth, unauthorized } from "@/lib/api-auth";
import { pintarSerieSchema } from "@/lib/validations/ops";
import {
  createOpsAuditLog,
  ensureOpsAccess,
  generateSerieForMonth,
  getMonthDateRange,
  listDatesBetween,
  parseDateOnly,
  toISODate,
} from "@/lib/ops";
import { ABSENCE_CODES } from "@/lib/ops/ensure-asistencia-dia-helpers";
import {
  hoyChileDate,
  resolveVigente,
  solapaRangoWhere,
  type RangoVigencia,
} from "@/lib/ops/asignacion-vigencia";

type SlotAsignacion = RangoVigencia & { guardiaId: string };

/**
 * Upserts pauta entries for a set of serie entries.
 * `plannedGuardiaId` se resuelve por vigencia en cada fecha.
 * No sobrescribe celdas con código de ausencia ligado a un evento.
 */
async function upsertPautaEntries(
  entries: { date: Date; shiftCode: string }[],
  puestoId: string,
  slotNumber: number,
  installationId: string,
  tenantId: string,
  userId: string,
  asignaciones: SlotAsignacion[],
  seriesStartDate: Date
): Promise<number> {
  const relevantDates = entries
    .map((e) => parseDateOnly(toISODate(e.date)))
    .filter((d) => d >= seriesStartDate);

  const existing = relevantDates.length
    ? await prisma.opsPautaMensual.findMany({
        where: {
          tenantId,
          puestoId,
          slotNumber,
          date: { in: relevantDates },
        },
        select: { date: true, shiftCode: true, guardEventId: true },
      })
    : [];
  const existingByKey = new Map(
    existing.map((e) => [toISODate(e.date), e]),
  );

  let updated = 0;
  for (const entry of entries) {
    const dateOnly = parseDateOnly(toISODate(entry.date));
    if (dateOnly < seriesStartDate) continue;

    const vigente = resolveVigente(asignaciones, dateOnly);
    const plannedGuardiaId =
      entry.shiftCode === "T" && vigente ? vigente.guardiaId : null;

    const prev = existingByKey.get(toISODate(dateOnly));
    const preserveAbsence =
      !!prev?.guardEventId &&
      !!prev.shiftCode &&
      ABSENCE_CODES.includes(prev.shiftCode);

    if (preserveAbsence) {
      await prisma.opsPautaMensual.update({
        where: {
          puestoId_slotNumber_date: { puestoId, slotNumber, date: dateOnly },
        },
        data: { plannedGuardiaId },
      });
      updated++;
      continue;
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

    const { start: monthStart, end: monthEnd } = getMonthDateRange(body.year, body.month);
    const slotAsignaciones = await prisma.opsAsignacionGuardia.findMany({
      where: {
        tenantId: ctx.tenantId,
        puestoId: body.puestoId,
        slotNumber: body.slotNumber,
        ...solapaRangoWhere(monthStart, monthEnd),
      },
      select: { guardiaId: true, startDate: true, endDate: true, createdAt: true },
    });
    const vigenteSerie = resolveVigente(slotAsignaciones, hoyChileDate())
      ?? [...slotAsignaciones].sort((a, b) => b.startDate.getTime() - a.startDate.getTime())[0]
      ?? null;
    const asignacion = vigenteSerie
      ? { guardiaId: vigenteSerie.guardiaId, startDate: vigenteSerie.startDate }
      : null;

    const startDate = parseDateOnly(body.startDate);
    // End date for previous series = day before new series starts (avoids gaps/overlaps)
    const prevSeriesEndDate = new Date(startDate);
    prevSeriesEndDate.setUTCDate(prevSeriesEndDate.getUTCDate() - 1);
    const paintDates = listDatesBetween(monthStart, monthEnd);

    if (body.isRotativo && (!body.rotatePuestoId || !body.rotateSlotNumber || !body.startShift)) {
      return NextResponse.json(
        { success: false, error: "Faltan datos de configuración para turno rotativo" },
        { status: 400 }
      );
    }

    // ── ROTATIVE SHIFT: solo pinta el slot origen ──
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

      // La serie rotativa vive en una sola línea (slot origen).
      // El par se guarda solo como metadata para identificar turno contrario.
      const serieEntries = generateSerieForMonth(
        startDate,
        body.startPosition,
        body.patternWork,
        body.patternOff,
        paintDates
      );

      // Deactivate previous series only for the current puesto/slot.
      await prisma.opsSerieAsignacion.updateMany({
        where: {
          tenantId: ctx.tenantId,
          puestoId: body.puestoId,
          slotNumber: body.slotNumber,
          isActive: true,
        },
        data: { isActive: false, endDate: prevSeriesEndDate },
      });

      // Create only the main serie (no mirrored serie).
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      await (prisma.opsSerieAsignacion.create as any)({
        data: {
          tenantId: ctx.tenantId,
          patternCode: body.patternCode,
          patternWork: body.patternWork,
          patternOff: body.patternOff,
          startDate,
          startPosition: body.startPosition,
          isActive: true,
          isRotativo: true,
          createdBy: ctx.userId,
          puestoId: body.puestoId,
          slotNumber: body.slotNumber,
          guardiaId: asignacion?.guardiaId ?? null,
          rotatePuestoId: body.rotatePuestoId,
          rotateSlotNumber: body.rotateSlotNumber,
          startShift: body.startShift,
        },
      });

      const updated = await upsertPautaEntries(
        serieEntries, body.puestoId, body.slotNumber,
        puesto.installationId, ctx.tenantId, ctx.userId,
        slotAsignaciones,
        startDate
      );

      await createOpsAuditLog(ctx, "ops.pauta.serie_rotativa_painted", "ops_pauta", puesto.installationId, {
        installationId: puesto.installationId,
        puestoId: body.puestoId,
        slotNumber: body.slotNumber,
        rotatePuestoId: body.rotatePuestoId,
        rotateSlotNumber: body.rotateSlotNumber,
        startShift: body.startShift,
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
      data: { isActive: false, endDate: prevSeriesEndDate },
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
      slotAsignaciones,
      startDate
    );

    await createOpsAuditLog(ctx, "ops.pauta.serie_painted", "ops_pauta", puesto.installationId, {
      installationId: puesto.installationId,
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
