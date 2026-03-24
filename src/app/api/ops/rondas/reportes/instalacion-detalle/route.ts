import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { requireAuth, unauthorized, resolveApiPerms } from "@/lib/api-auth";
import { canView } from "@/lib/permissions";
import { formatPersonName } from "@/lib/personas";

/**
 * GET /api/ops/rondas/reportes/instalacion-detalle
 *
 * Returns a grid of days x time-slots for a single installation over a date range.
 * Filas = días, columnas = slots horarios derivados de las programaciones activas.
 */
export async function GET(request: NextRequest) {
  try {
    const ctx = await requireAuth();
    if (!ctx) return unauthorized();
    const perms = await resolveApiPerms(ctx);
    if (!canView(perms, "ops", "rondas")) {
      return NextResponse.json({ success: false, error: "Sin permisos" }, { status: 403 });
    }

    const sp = request.nextUrl.searchParams;
    const installationId = sp.get("installationId");
    const from = sp.get("from");
    const to = sp.get("to");
    const cicloInicio = parseInt(sp.get("cicloInicio") ?? "20", 10);

    if (!installationId || !from || !to) {
      return NextResponse.json(
        { success: false, error: "installationId, from y to son requeridos" },
        { status: 400 },
      );
    }

    const diffDays = Math.ceil(
      (new Date(to).getTime() - new Date(from).getTime()) / (1000 * 60 * 60 * 24),
    );
    if (diffDays > 30 || diffDays < 0) {
      return NextResponse.json(
        { success: false, error: "Rango máximo: 30 días" },
        { status: 400 },
      );
    }

    // 1. Cycle boundaries for full range
    const rangeStart = new Date(`${from}T${String(cicloInicio).padStart(2, "0")}:00:00`);
    const lastDayEnd = new Date(`${to}T${String(cicloInicio).padStart(2, "0")}:00:00`);
    lastDayEnd.setTime(lastDayEnd.getTime() + 24 * 60 * 60 * 1000);

    // 4. All ejecuciones in range for this installation
    const ejecuciones = await prisma.opsRondaEjecucion.findMany({
      where: {
        tenantId: ctx.tenantId,
        scheduledAt: { gte: rangeStart, lt: lastDayEnd },
        OR: [
          { installationId },
          { rondaTemplate: { installationId } },
        ],
      },
      include: {
        guardia: {
          select: { persona: { select: { firstName: true, lastName: true } } },
        },
        rondaTemplate: {
          select: { name: true, checkpoints: { select: { id: true } } },
        },
        _count: {
          select: { marcaciones: true, incidentes: true, alertasRows: true },
        },
      },
      orderBy: { scheduledAt: "asc" },
    });

    // 5. Alertas in range — match by installationId OR by ejecucionId
    const ejecucionIdsForAlertas = ejecuciones.map((ej) => ej.id);
    const alertas = await prisma.opsAlertaRonda.findMany({
      where: {
        tenantId: ctx.tenantId,
        createdAt: { gte: rangeStart, lt: lastDayEnd },
        OR: [
          { installationId },
          ...(ejecucionIdsForAlertas.length > 0
            ? [{ ejecucionId: { in: ejecucionIdsForAlertas } }]
            : []),
        ],
      },
      select: {
        id: true,
        tipo: true,
        severidad: true,
        mensaje: true,
        resuelta: true,
        createdAt: true,
        ejecucionId: true,
      },
    });

    // 6. Incidentes in range — match by installationId OR by ejecucionId
    //    (historical incidents from GARD may lack installationId)
    const ejecucionIds = ejecuciones.map((ej) => ej.id);
    const incidentes = await prisma.opsRondaIncidente.findMany({
      where: {
        tenantId: ctx.tenantId,
        createdAt: { gte: rangeStart, lt: lastDayEnd },
        OR: [
          { installationId },
          ...(ejecucionIds.length > 0
            ? [{ ejecucionId: { in: ejecucionIds } }]
            : []),
        ],
      },
      select: {
        id: true,
        tipo: true,
        descripcion: true,
        status: true,
        createdAt: true,
        ejecucionId: true,
      },
    });

    // 6b. Build slots from actual ejecuciones data (data-driven, not theoretical)
    const slots = buildSlotsFromEjecuciones(ejecuciones, cicloInicio);

    // 7. Build daily rows
    const days: DayRow[] = [];
    const startDate = new Date(from);
    const endDate = new Date(to);

    for (let d = new Date(startDate); d <= endDate; d.setDate(d.getDate() + 1)) {
      const dayStr = d.toISOString().split("T")[0];
      const cycleStart = new Date(
        `${dayStr}T${String(cicloInicio).padStart(2, "0")}:00:00`,
      );
      const cycleEnd = new Date(cycleStart.getTime() + 24 * 60 * 60 * 1000);

      const dayEjecuciones = ejecuciones.filter((ej) => {
        const t = new Date(ej.scheduledAt).getTime();
        return t >= cycleStart.getTime() && t < cycleEnd.getTime();
      });

      const dayAlertas = alertas.filter((a) => {
        const t = new Date(a.createdAt).getTime();
        return t >= cycleStart.getTime() && t < cycleEnd.getTime();
      });

      const dayIncidentes = incidentes.filter((i) => {
        const t = new Date(i.createdAt).getTime();
        return t >= cycleStart.getTime() && t < cycleEnd.getTime();
      });

      const cells = slots.map((slot) => {
        const slotHour = parseInt(slot.label.split(":")[0], 10);

        const slotEjecuciones = dayEjecuciones.filter((ej) => {
          const ejHour = parseInt(
            new Date(ej.scheduledAt).toLocaleTimeString("en-US", {
              hour: "2-digit",
              hour12: false,
              timeZone: "America/Santiago",
            }),
            10,
          );
          return ejHour === slotHour;
        });

        const completadas = slotEjecuciones.filter(
          (ej) => ej.status === "completada",
        ).length;
        const incompletas = slotEjecuciones.filter(
          (ej) => ej.status === "incompleta",
        ).length;
        const activas = slotEjecuciones.filter(
          (ej) =>
            ["completada", "incompleta", "en_curso"].includes(ej.status),
        ).length;

        const slotAlertaIds = new Set(slotEjecuciones.map((ej) => ej.id));
        const slotAlertas = dayAlertas.filter(
          (a) => a.ejecucionId && slotAlertaIds.has(a.ejecucionId),
        );
        const slotIncidentes = dayIncidentes.filter(
          (i) => i.ejecucionId && slotAlertaIds.has(i.ejecucionId),
        );

        // esperadas = total ejecuciones scheduled in this slot (data-driven)
        const esperadas = slotEjecuciones.length;

        return {
          slotKey: slot.label,
          esperadas,
          completadas,
          incompletas,
          noRealizadas: Math.max(0, esperadas - activas),
          alertCount: slotAlertas.length,
          incidentCount: slotIncidentes.length,
          hasPanico: slotAlertas.some((a) => a.tipo === "panico"),
          ejecuciones: slotEjecuciones.map((ej) => {
            const cpTotal = ej.rondaTemplate?.checkpoints?.length ?? ej.checkpointsTotal;
            return {
              id: ej.id,
              status: ej.status,
              guardiaName: ej.guardia?.persona
                ? formatPersonName(ej.guardia.persona.firstName, ej.guardia.persona.lastName)
                : "Sin asignar",
              startedAt: ej.startedAt?.toISOString() ?? null,
              completedAt: ej.completedAt?.toISOString() ?? null,
              completionPercent: cpTotal > 0
                ? Math.round((ej._count.marcaciones / cpTotal) * 100)
                : Math.round(ej.porcentajeCompletado),
              trustScore: ej.trustScore,
              templateName: ej.rondaTemplate?.name ?? null,
              durationMinutes: ej.durationMinutes ?? null,
              incidentCount: ej._count.incidentes,
              alertCount: ej._count.alertasRows,
              checkpointsCompletados: ej.checkpointsCompletados,
              checkpointsTotal: ej.checkpointsTotal,
            };
          }),
        };
      });

      days.push({
        date: dayStr,
        dayLabel: new Date(dayStr + "T12:00:00").toLocaleDateString("es-CL", {
          weekday: "short",
          day: "numeric",
          month: "short",
          timeZone: "America/Santiago",
        }),
        cells,
        totalEsperadas: cells.reduce((s, c) => s + c.esperadas, 0),
        totalCompletadas: cells.reduce((s, c) => s + c.completadas, 0),
        totalAlerts: dayAlertas.length,
        totalIncidents: dayIncidentes.length,
      });
    }

    // 8. Resumen global
    const totalEsperadas = days.reduce((s, d) => s + d.totalEsperadas, 0);
    const completadasTotal = ejecuciones.filter((e) => e.status === "completada").length;

    const resumen = {
      totalRondas: ejecuciones.length,
      completadas: completadasTotal,
      incompletas: ejecuciones.filter((e) => e.status === "incompleta").length,
      noRealizadas: days.reduce(
        (s, d) => s + d.cells.reduce((s2, c) => s2 + c.noRealizadas, 0),
        0,
      ),
      cumplimiento:
        totalEsperadas > 0 ? Math.round((completadasTotal / totalEsperadas) * 100) : 0,
      totalAlertas: alertas.length,
      alertasPanico: alertas.filter((a) => a.tipo === "panico").length,
      totalIncidentes: incidentes.length,
      incidentesPendientes: incidentes.filter((i) => i.status === "abierto").length,
    };

    return NextResponse.json({
      success: true,
      data: {
        resumen,
        slots: slots.map((s) => ({ label: s.label, offsetMinutes: s.offsetMinutes })),
        days,
        ciclo: `${String(cicloInicio).padStart(2, "0")}:00 → ${String(cicloInicio).padStart(2, "0")}:00 (+1)`,
      },
    });
  } catch (error) {
    console.error("[RONDAS] instalacion-detalle", error);
    return NextResponse.json({ success: false, error: "Error interno" }, { status: 500 });
  }
}

// ── Types ──

interface SlotDef {
  label: string;
  offsetMinutes: number;
  durationMinutes: number;
  expectedCount: number;
}

interface RondaInstalacionDetalleEjecucionRow {
  id: string;
  status: string;
  guardiaName: string;
  startedAt: string | null;
  completedAt: string | null;
  completionPercent: number;
  trustScore: number;
  templateName: string | null;
  durationMinutes: number | null;
  incidentCount: number;
  alertCount: number;
  checkpointsCompletados: number;
  checkpointsTotal: number;
}

interface RondaInstalacionDetalleCell {
  slotKey: string;
  esperadas: number;
  completadas: number;
  incompletas: number;
  noRealizadas: number;
  alertCount: number;
  incidentCount: number;
  hasPanico: boolean;
  ejecuciones: RondaInstalacionDetalleEjecucionRow[];
}

interface DayRow {
  date: string;
  dayLabel: string;
  cells: RondaInstalacionDetalleCell[];
  totalEsperadas: number;
  totalCompletadas: number;
  totalAlerts: number;
  totalIncidents: number;
}

// ── Helpers ──

/**
 * Build hourly slot definitions from actual ejecuciones data.
 * Extracts all unique scheduledAt hours across the dataset to determine columns.
 * This is more reliable than deriving from programaciones because it shows the
 * real schedule that was generated by the scheduler.
 */
function buildSlotsFromEjecuciones(
  ejecuciones: Array<{ scheduledAt: Date }>,
  cicloInicio: number,
): SlotDef[] {
  const hours = new Set<number>();

  for (const ej of ejecuciones) {
    // Use Chile timezone to get the local hour (matches what the user sees)
    const localHour = parseInt(
      new Date(ej.scheduledAt).toLocaleTimeString("en-US", {
        hour: "2-digit",
        hour12: false,
        timeZone: "America/Santiago",
      }),
      10,
    );
    hours.add(localHour);
  }

  if (hours.size === 0) {
    return [];
  }

  // Sort hours within the operational cycle (cicloInicio wrapping around midnight)
  const sortedHours = [...hours].sort((a, b) => {
    const aOffset = a >= cicloInicio ? a - cicloInicio : a + 24 - cicloInicio;
    const bOffset = b >= cicloInicio ? b - cicloInicio : b + 24 - cicloInicio;
    return aOffset - bOffset;
  });

  return sortedHours.map((hour) => {
    const offsetFromCycle =
      hour >= cicloInicio ? hour - cicloInicio : hour + 24 - cicloInicio;

    return {
      label: `${String(hour).padStart(2, "0")}:00`,
      offsetMinutes: offsetFromCycle * 60,
      durationMinutes: 60,
      expectedCount: 0, // not used — esperadas is calculated per-cell from actual data
    };
  });
}
