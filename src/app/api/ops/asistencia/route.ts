import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { requireAuth, unauthorized } from "@/lib/api-auth";
import { ensureOpsAccess, parseDateOnly, toISODate } from "@/lib/ops";
import { ensureAsistenciaDia } from "@/lib/ops/ensure-asistencia-dia";
import {
  ABSENCE_CODES,
  buildEffectiveShiftCode,
  loadPautaForDate,
} from "@/lib/ops/ensure-asistencia-dia-helpers";

export async function GET(request: NextRequest) {
  try {
    const ctx = await requireAuth();
    if (!ctx) return unauthorized();
    const forbidden = await ensureOpsAccess(ctx);
    if (forbidden) return forbidden;

    const installationId = request.nextUrl.searchParams.get("installationId") || undefined;
    const dateRaw = request.nextUrl.searchParams.get("date") || toISODate(new Date());

    const date = parseDateOnly(dateRaw);

    // If installationId = "all", get all installations
    const installationFilter = installationId && installationId !== "all"
      ? { installationId }
      : {};

    // Materializa OpsAsistenciaDiaria desde la pauta (on-demand al abrir la
    // vista). La misma generación la reutiliza el cron del tablero de relevo.
    await ensureAsistenciaDia({
      tenantId: ctx.tenantId,
      installationId,
      date,
      createdBy: ctx.userId,
    });

    const asistencia = await prisma.opsAsistenciaDiaria.findMany({
      where: {
        tenantId: ctx.tenantId,
        ...installationFilter,
        date,
        puesto: { active: true },
      },
      include: {
        installation: {
          select: { id: true, name: true },
        },
        puesto: {
          select: {
            id: true,
            name: true,
            shiftStart: true,
            shiftEnd: true,
            teMontoClp: true,
            requiredGuards: true,
          },
        },
        plannedGuardia: {
          select: {
            id: true,
            code: true,
            lifecycleStatus: true,
            persona: { select: { firstName: true, lastName: true, rut: true } },
          },
        },
        actualGuardia: {
          select: {
            id: true,
            code: true,
            lifecycleStatus: true,
            persona: { select: { firstName: true, lastName: true, rut: true } },
          },
        },
        replacementGuardia: {
          select: {
            id: true,
            code: true,
            lifecycleStatus: true,
            persona: { select: { firstName: true, lastName: true, rut: true } },
          },
        },
        turnosExtra: {
          select: {
            id: true,
            status: true,
            amountClp: true,
            amountJustification: true,
            tipo: true,
            horasExtra: true,
            guardiaId: true,
          },
        },
      },
      orderBy: [
        { installation: { name: "asc" } },
        { puesto: { name: "asc" } },
        { slotNumber: "asc" },
      ],
    });

    const instIds = [...new Set(asistencia.map((a) => a.installationId))];
    const guardiaIds = [
      ...new Set(
        asistencia.flatMap((a) =>
          [a.actualGuardiaId, a.replacementGuardiaId, a.plannedGuardiaId].filter(
            (id): id is string => id != null
          )
        )
      ),
    ];

    const marcaciones =
      guardiaIds.length > 0 && instIds.length > 0
        ? await prisma.opsMarcacion.findMany({
          where: {
            tenantId: ctx.tenantId,
            guardiaId: { in: guardiaIds },
            installationId: { in: instIds },
            timestamp: {
              gte: new Date(date.getTime()),
              lt: new Date(date.getTime() + 24 * 60 * 60 * 1000),
            },
            deletedAt: null,
          },
          select: {
            id: true,
            guardiaId: true,
            installationId: true,
            tipo: true,
            timestamp: true,
            hashIntegridad: true,
            geoValidada: true,
            geoDistanciaM: true,
            gpsStatus: true,
            lat: true,
            lng: true,
            ipAddress: true,
            userAgent: true,
            metodoId: true,
            pinFallbackReason: true,
            fotoEvidenciaUrl: true,
            devicePairing: {
              select: { name: true, deviceModel: true },
            },
          },
          orderBy: { timestamp: "asc" },
        })
        : [];

    const toDeviceDisplay = (dp: { name: string | null; deviceModel: string | null } | null): string | null => {
      if (!dp) return null;
      if (dp.name) return `Equipo sincronizado: ${dp.name}`;
      if (dp.deviceModel) return `Dispositivo del usuario: ${dp.deviceModel}`;
      return "Dispositivo del portal";
    };

    const marcacionesByKey = new Map<string, Array<Omit<(typeof marcaciones)[number], "devicePairing"> & { deviceDisplay: string | null }>>();
    for (const m of marcaciones) {
      const key = `${m.guardiaId}|${m.installationId}`;
      const list = marcacionesByKey.get(key) ?? [];
      const { devicePairing, ...rest } = m;
      list.push({
        ...rest,
        deviceDisplay: toDeviceDisplay(devicePairing) ?? (m.userAgent ? "Navegador web" : null),
      });
      marcacionesByKey.set(key, list);
    }

    // Build absence code lookup from pauta (puestoId|slotNumber → shiftCode)
    // Usa el código efectivo (overlay de ausencias aprobadas) para que el motivo
    // se muestre aunque la celda de la pauta no se haya repintado. La misma pauta
    // y overlay que usó `ensureAsistenciaDia` para materializar; se recomputa aquí
    // (lectura barata e idéntica) para adjuntar el motivo de ausencia a la respuesta.
    const pauta = await loadPautaForDate({ tenantId: ctx.tenantId, installationId, date });
    const effectiveShiftCode = await buildEffectiveShiftCode({ tenantId: ctx.tenantId, date }, pauta);
    const absenceBySlot = new Map<string, string>();
    for (const p of pauta) {
      const code = effectiveShiftCode(p);
      if (code && ABSENCE_CODES.includes(code)) {
        absenceBySlot.set(`${p.puestoId}|${p.slotNumber}`, code);
      }
    }

    const itemsWithMarcaciones = asistencia.map((row) => {
      const guardiaId =
        row.actualGuardiaId ?? row.replacementGuardiaId ?? row.plannedGuardiaId;
      const key = guardiaId ? `${guardiaId}|${row.installationId}` : null;
      const marcacionesRow = key ? marcacionesByKey.get(key) ?? [] : [];
      const absenceCode = absenceBySlot.get(`${row.puestoId}|${row.slotNumber}`) ?? null;
      return {
        ...row,
        marcaciones: marcacionesRow,
        absenceCode,
      };
    });

    return NextResponse.json({
      success: true,
      data: {
        date: dateRaw,
        items: itemsWithMarcaciones,
      },
    });
  } catch (error) {
    const message = error instanceof Error ? error.message : "Error desconocido";
    console.error("[OPS] Error listing asistencia:", error);
    return NextResponse.json(
      {
        success: false,
        error: "No se pudo obtener la asistencia diaria",
        errorDetail: process.env.NODE_ENV === "development" ? message : undefined,
      },
      { status: 500 }
    );
  }
}
