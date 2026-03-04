import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { parseBody, requireAuth, unauthorized } from "@/lib/api-auth";
import { upsertPautaItemSchema } from "@/lib/validations/ops";
import {
  buildExecutionMap,
  createOpsAuditLog,
  ensureOpsAccess,
  generateSerieForMonth,
  getMonthDateRange,
  listDatesBetween,
  parseDateOnly,
  toDateKeyUTC,
} from "@/lib/ops";

export async function GET(request: NextRequest) {
  try {
    const ctx = await requireAuth();
    if (!ctx) return unauthorized();
    const forbidden = await ensureOpsAccess(ctx);
    if (forbidden) return forbidden;

    const installationId = request.nextUrl.searchParams.get("installationId") || undefined;
    const month = Number(request.nextUrl.searchParams.get("month") || new Date().getUTCMonth() + 1);
    const year = Number(request.nextUrl.searchParams.get("year") || new Date().getUTCFullYear());

    if (!installationId) {
      return NextResponse.json(
        { success: false, error: "installationId es requerido" },
        { status: 400 }
      );
    }

    const { start, end } = getMonthDateRange(year, month);

    // Bug 4 fix: Only include pauta entries for active puestos
    const pauta = await prisma.opsPautaMensual.findMany({
      where: {
        tenantId: ctx.tenantId,
        installationId,
        date: {
          gte: start,
          lte: end,
        },
        puesto: { tenantId: ctx.tenantId, active: true },
      },
      include: {
        puesto: {
          select: {
            id: true,
            name: true,
            shiftStart: true,
            shiftEnd: true,
            weekdays: true,
            requiredGuards: true,
            cargo: { select: { name: true } },
            puestoTrabajo: { select: { name: true } },
          },
        },
        plannedGuardia: {
          select: {
            id: true,
            code: true,
            status: true,
            lifecycleStatus: true,
            terminatedAt: true,
            persona: {
              select: {
                firstName: true,
                lastName: true,
                rut: true,
              },
            },
          },
        },
        replacementGuardia: {
          select: {
            id: true,
            code: true,
            persona: {
              select: { firstName: true, lastName: true },
            },
          },
        },
      },
      orderBy: [{ puestoId: "asc" }, { slotNumber: "asc" }, { date: "asc" }],
    });

    // Bugs 1/3/5 fix: Auto-sync missing slots for active puestos.
    // If a puesto was added after pauta generation, or requiredGuards increased,
    // create the missing OpsPautaMensual rows so they appear in the UI.
    const activePuestos = await prisma.opsPuestoOperativo.findMany({
      where: { tenantId: ctx.tenantId, installationId, active: true },
      select: { id: true, requiredGuards: true, activeFrom: true, activeUntil: true },
    });

    // Build a set of existing puesto+slot+date combos for fast lookup
    const existingKeys = new Set(
      pauta.map((p) => `${p.puestoId}|${p.slotNumber}|${p.date.toISOString().slice(0, 10)}`)
    );

    const monthDates = listDatesBetween(start, end);
    const missingRows: {
      tenantId: string;
      installationId: string;
      puestoId: string;
      slotNumber: number;
      date: Date;
      plannedGuardiaId: string | null;
      shiftCode: string | null;
      status: string;
      createdBy: string | null;
    }[] = [];

    for (const puesto of activePuestos) {
      for (const date of monthDates) {
        // Respect active date range
        if (puesto.activeFrom && date < puesto.activeFrom) continue;
        if (puesto.activeUntil && date >= puesto.activeUntil) continue;

        const dateKey = date.toISOString().slice(0, 10);
        for (let slot = 1; slot <= puesto.requiredGuards; slot++) {
          const key = `${puesto.id}|${slot}|${dateKey}`;
          if (!existingKeys.has(key)) {
            missingRows.push({
              tenantId: ctx.tenantId,
              installationId: installationId!,
              puestoId: puesto.id,
              slotNumber: slot,
              date,
              plannedGuardiaId: null,
              shiftCode: null,
              status: "planificado",
              createdBy: null,
            });
          }
        }
      }
    }

    if (missingRows.length > 0) {
      await prisma.opsPautaMensual.createMany({
        data: missingRows,
        skipDuplicates: true,
      });

      // Audit: auto-sync created missing pauta rows
      await createOpsAuditLog(ctx, "ops.pauta.auto_sync_created", "ops_pauta", installationId, {
        month,
        year,
        rowsCreated: missingRows.length,
        puestoIds: [...new Set(missingRows.map((r) => r.puestoId))],
      });

      // Re-fetch to include the newly created rows (same include as initial query)
      const refetched = await prisma.opsPautaMensual.findMany({
        where: {
          tenantId: ctx.tenantId,
          installationId,
          date: { gte: start, lte: end },
          puesto: { tenantId: ctx.tenantId, active: true },
        },
        include: {
          puesto: {
            select: {
              id: true,
              name: true,
              shiftStart: true,
              shiftEnd: true,
              weekdays: true,
              requiredGuards: true,
              cargo: { select: { name: true } },
              puestoTrabajo: { select: { name: true } },
            },
          },
          plannedGuardia: {
            select: {
              id: true,
              code: true,
              status: true,
              lifecycleStatus: true,
              terminatedAt: true,
              persona: { select: { firstName: true, lastName: true, rut: true } },
            },
          },
          replacementGuardia: {
            select: {
              id: true,
              code: true,
              persona: { select: { firstName: true, lastName: true } },
            },
          },
        },
        orderBy: [{ puestoId: "asc" }, { slotNumber: "asc" }, { date: "asc" }],
      });
      pauta.length = 0;
      pauta.push(...refetched);
    }

    // ── Auto-project active series to unpainted cells ──
    // If a serie is active but cells still have shiftCode=null, project the pattern.
    // This enables auto-continuation: when a user opens a new month, series from
    // previous months are automatically projected without manual re-painting.
    const puestoIdsForSeries = [...new Set(activePuestos.map((p) => p.id))];
    if (puestoIdsForSeries.length > 0) {
      // Fetch active series for all puestos in this installation
      const activeSeries = await prisma.opsSerieAsignacion.findMany({
        where: {
          tenantId: ctx.tenantId,
          puestoId: { in: puestoIdsForSeries },
          isActive: true,
        },
        select: {
          puestoId: true,
          slotNumber: true,
          guardiaId: true,
          patternWork: true,
          patternOff: true,
          startDate: true,
          startPosition: true,
        },
      });

      // Fetch active guard assignments to know who works each slot
      const activeAsignaciones = await prisma.opsAsignacionGuardia.findMany({
        where: {
          tenantId: ctx.tenantId,
          puestoId: { in: puestoIdsForSeries },
          isActive: true,
        },
        select: {
          puestoId: true,
          slotNumber: true,
          guardiaId: true,
          startDate: true,
          guardia: { select: { lifecycleStatus: true } },
        },
      });

      // Build lookup: puestoId|slotNumber → asignacion (skip inactive/terminated guards)
      const asignacionMap = new Map<string, { guardiaId: string; startDate: Date }>();
      for (const a of activeAsignaciones) {
        if (a.guardia?.lifecycleStatus === "inactivo") continue;
        asignacionMap.set(`${a.puestoId}|${a.slotNumber}`, {
          guardiaId: a.guardiaId,
          startDate: a.startDate,
        });
      }

      // Build set of cells that already have a shiftCode (manual edits or previous painting)
      const paintedKeys = new Set<string>();
      for (const p of pauta) {
        if (p.shiftCode != null) {
          paintedKeys.add(`${p.puestoId}|${p.slotNumber}|${p.date.toISOString().slice(0, 10)}`);
        }
      }

      // For each active serie, project pattern onto unpainted cells
      const updates: Promise<unknown>[] = [];
      for (const serie of activeSeries) {
        const entries = generateSerieForMonth(
          serie.startDate,
          serie.startPosition,
          serie.patternWork,
          serie.patternOff,
          monthDates
        );

        const asig = asignacionMap.get(`${serie.puestoId}|${serie.slotNumber}`);

        for (const entry of entries) {
          const dateKey = toDateKeyUTC(entry.date);
          const cellKey = `${serie.puestoId}|${serie.slotNumber}|${dateKey}`;

          // Only update cells that have no shiftCode (don't overwrite manual edits)
          if (paintedKeys.has(cellKey)) continue;

          // Determine plannedGuardiaId: use asignacion guardia on work days
          let plannedGuardiaId: string | null = null;
          if (entry.shiftCode === "T" && asig && entry.date >= asig.startDate) {
            plannedGuardiaId = asig.guardiaId;
          }

          // Use updateMany to avoid errors if row doesn't exist yet
          updates.push(
            prisma.opsPautaMensual.updateMany({
              where: {
                tenantId: ctx.tenantId,
                puestoId: serie.puestoId,
                slotNumber: serie.slotNumber,
                date: entry.date,
                shiftCode: null, // Double-check: only update if still null
              },
              data: {
                shiftCode: entry.shiftCode,
                plannedGuardiaId,
              },
            })
          );
          // Mark as painted so we don't double-process
          paintedKeys.add(cellKey);
        }
      }

      if (updates.length > 0) {
        await Promise.all(updates);

        // Audit: auto-projected series onto unpainted cells
        await createOpsAuditLog(ctx, "ops.pauta.auto_sync_projected", "ops_pauta", installationId, {
          month,
          year,
          cellsProjected: updates.length,
          seriesCount: activeSeries.length,
        });

        // Re-fetch pauta to include the updated shiftCodes (same include as initial query)
        const refetched = await prisma.opsPautaMensual.findMany({
          where: {
            tenantId: ctx.tenantId,
            installationId,
            date: { gte: start, lte: end },
            puesto: { tenantId: ctx.tenantId, active: true },
          },
          include: {
            puesto: {
              select: {
                id: true,
                name: true,
                shiftStart: true,
                shiftEnd: true,
                weekdays: true,
                requiredGuards: true,
                cargo: { select: { name: true } },
                puestoTrabajo: { select: { name: true } },
              },
            },
            plannedGuardia: {
              select: {
                id: true,
                code: true,
                status: true,
                lifecycleStatus: true,
                terminatedAt: true,
                persona: { select: { firstName: true, lastName: true, rut: true } },
              },
            },
            replacementGuardia: {
              select: {
                id: true,
                code: true,
                persona: { select: { firstName: true, lastName: true } },
              },
            },
          },
          orderBy: [{ puestoId: "asc" }, { slotNumber: "asc" }, { date: "asc" }],
        });
        pauta.length = 0;
        pauta.push(...refetched);
      }
    }

    // Also get active series for this installation
    // Uses try-catch: rotative fields may not exist if migration hasn't been applied
    const puestoIds = [...new Set(pauta.map((p) => p.puestoId))];
    let series: Record<string, unknown>[] = [];
    if (puestoIds.length > 0) {
      try {
        series = await prisma.opsSerieAsignacion.findMany({
          where: {
            tenantId: ctx.tenantId,
            puestoId: { in: puestoIds },
            isActive: true,
          },
          select: {
            id: true,
            puestoId: true,
            slotNumber: true,
            guardiaId: true,
            patternCode: true,
            patternWork: true,
            patternOff: true,
            startDate: true,
            startPosition: true,
            isRotativo: true,
            rotatePuestoId: true,
            rotateSlotNumber: true,
            startShift: true,
            linkedSerieId: true,
            guardia: {
              select: {
                id: true,
                code: true,
                persona: {
                  select: { firstName: true, lastName: true },
                },
              },
            },
          },
        });
      } catch {
        // Fallback: rotative fields not yet in DB (migration pending)
        series = await prisma.opsSerieAsignacion.findMany({
          where: {
            tenantId: ctx.tenantId,
            puestoId: { in: puestoIds },
            isActive: true,
          },
          select: {
            id: true,
            puestoId: true,
            slotNumber: true,
            guardiaId: true,
            patternCode: true,
            patternWork: true,
            patternOff: true,
            startDate: true,
            startPosition: true,
            guardia: {
              select: {
                id: true,
                code: true,
                persona: {
                  select: { firstName: true, lastName: true },
                },
              },
            },
          },
        });
      }
    }

    // Get all puestos for this installation (for rotative puesto selector in UI)
    const allPuestos = await prisma.opsPuestoOperativo.findMany({
      where: {
        tenantId: ctx.tenantId,
        installationId,
        active: true,
      },
      select: {
        id: true,
        name: true,
        shiftStart: true,
        shiftEnd: true,
        requiredGuards: true,
        cargo: { select: { name: true } },
        puestoTrabajo: { select: { name: true } },
      },
      orderBy: { name: "asc" },
    });

    // Also get active guard assignments for this installation
    const asignaciones = await prisma.opsAsignacionGuardia.findMany({
      where: {
        tenantId: ctx.tenantId,
        installationId,
        isActive: true,
      },
      select: {
        puestoId: true,
        slotNumber: true,
        guardiaId: true,
        guardia: {
          select: {
            id: true,
            code: true,
            lifecycleStatus: true,
            terminatedAt: true,
            persona: { select: { firstName: true, lastName: true, rut: true } },
          },
        },
      },
    });

    // Fetch absences (OpsGuardEvent) for planned guardias in this pauta
    const plannedGuardiaIds = [...new Set(pauta.map((p) => p.plannedGuardiaId).filter((id): id is string => id !== null))];
    const ausencias = await prisma.opsGuardEvent.findMany({
      where: {
        tenantId: ctx.tenantId,
        guardiaId: { in: plannedGuardiaIds },
        category: "ausencia",
        status: "approved",
        startDate: { lte: end },
        endDate: { gte: start },
      },
      select: {
        id: true,
        guardiaId: true,
        subtype: true,
        startDate: true,
        endDate: true,
      },
    });

    // Group ausencias by guardiaId for easy client consumption
    const absencesByGuardia = ausencias.reduce<Record<string, { eventId: string; subtype: string; startDate: Date; endDate: Date }[]>>((acc, a) => {
      if (!acc[a.guardiaId]) acc[a.guardiaId] = [];
      acc[a.guardiaId].push({
        eventId: a.id,
        subtype: a.subtype,
        startDate: a.startDate!,
        endDate: a.endDate!,
      });
      return acc;
    }, {});

    const asistencia = await prisma.opsAsistenciaDiaria.findMany({
      where: {
        tenantId: ctx.tenantId,
        installationId,
        date: {
          gte: start,
          lte: end,
        },
      },
      select: {
        puestoId: true,
        slotNumber: true,
        date: true,
        attendanceStatus: true,
        plannedGuardiaId: true,
        actualGuardiaId: true,
        replacementGuardiaId: true,
        turnosExtra: {
          select: {
            id: true,
            status: true,
          },
        },
      },
    });

    // Lógica canónica de ejecución compartida (ops.ts)
    const executionByCell = buildExecutionMap(asistencia);

    return NextResponse.json({
      success: true,
      data: {
        month,
        year,
        installationId,
        items: pauta,
        series,
        asignaciones,
        executionByCell,
        allPuestos,
        absencesByGuardia,
      },
    });
  } catch (error) {
    const message = error instanceof Error ? error.message : "No se pudo obtener la pauta mensual";
    console.error("[OPS] Error listing pauta mensual:", error);
    return NextResponse.json(
      { success: false, error: message },
      { status: 500 }
    );
  }
}

export async function POST(request: NextRequest) {
  try {
    const ctx = await requireAuth();
    if (!ctx) return unauthorized();
    const forbidden = await ensureOpsAccess(ctx);
    if (forbidden) return forbidden;

    const parsed = await parseBody(request, upsertPautaItemSchema);
    if (parsed.error) return parsed.error;
    const body = parsed.data;

    const puesto = await prisma.opsPuestoOperativo.findFirst({
      where: { id: body.puestoId, tenantId: ctx.tenantId },
      select: { id: true, installationId: true, active: true },
    });
    if (!puesto) {
      return NextResponse.json(
        { success: false, error: "Puesto operativo no encontrado" },
        { status: 404 }
      );
    }
    if (!puesto.active) {
      return NextResponse.json(
        { success: false, error: "No se puede crear turnos para un puesto desactivado" },
        { status: 400 }
      );
    }

    if (body.plannedGuardiaId) {
      const guardia = await prisma.opsGuardia.findFirst({
        where: { id: body.plannedGuardiaId, tenantId: ctx.tenantId },
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
          { success: false, error: "No se puede asignar un guardia inactivo o en lista negra" },
          { status: 400 }
        );
      }
    }

    const date = parseDateOnly(body.date);

    const pauta = await prisma.opsPautaMensual.upsert({
      where: {
        puestoId_slotNumber_date: {
          puestoId: body.puestoId,
          slotNumber: body.slotNumber,
          date,
        },
      },
      create: {
        tenantId: ctx.tenantId,
        installationId: puesto.installationId,
        puestoId: body.puestoId,
        slotNumber: body.slotNumber,
        date,
        plannedGuardiaId: body.plannedGuardiaId ?? null,
        shiftCode: body.shiftCode ?? null,
        status: body.status,
        notes: body.notes ?? null,
        // (body.any as Record<string, unknown>) is used to handle additional fields from client request
        replacementGuardiaId: (body as any).replacementGuardiaId ?? null,
        replacementReason: (body as any).replacementReason ?? null,
        guardEventId: (body as any).guardEventId ?? null,
        createdBy: ctx.userId,
      },
      update: {
        plannedGuardiaId: body.plannedGuardiaId ?? null,
        shiftCode: body.shiftCode ?? null,
        status: body.status,
        notes: body.notes ?? null,
        replacementGuardiaId: (body as any).replacementGuardiaId !== undefined ? (body as any).replacementGuardiaId : undefined,
        replacementReason: (body as any).replacementReason !== undefined ? (body as any).replacementReason : undefined,
        guardEventId: (body as any).guardEventId !== undefined ? (body as any).guardEventId : undefined,
      },
      include: {
        puesto: {
          select: { id: true, name: true, shiftStart: true, shiftEnd: true },
        },
        plannedGuardia: {
          select: {
            id: true,
            code: true,
            persona: { select: { firstName: true, lastName: true } },
          },
        },
        replacementGuardia: {
          select: {
            id: true,
            code: true,
            persona: { select: { firstName: true, lastName: true } },
          },
        },
      },
    });

    await createOpsAuditLog(ctx, "ops.pauta.upsert", "ops_pauta", pauta.id, {
      installationId: puesto.installationId,
      puestoId: body.puestoId,
      slotNumber: body.slotNumber,
      date: body.date,
      plannedGuardiaId: body.plannedGuardiaId ?? null,
      shiftCode: body.shiftCode ?? null,
      replacementGuardiaId: (body as any).replacementGuardiaId ?? null,
    });

    return NextResponse.json({ success: true, data: pauta });
  } catch (error) {
    console.error("[OPS] Error upserting pauta item:", error);
    return NextResponse.json(
      { success: false, error: "No se pudo guardar la pauta" },
      { status: 500 }
    );
  }
}
