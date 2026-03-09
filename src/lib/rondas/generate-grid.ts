/**
 * Generate grid slots for Control Nocturno.
 *
 * Called when a turno is linked to a CN. Generates hourly slots
 * with rondaExpected pre-calculated based on programacion data,
 * and pre-populates guards from pauta mensual / asignaciones / previous CN.
 */

import { prisma } from "@/lib/prisma";
import { generateTimeSlots } from "@/lib/rondas/grid-utils";
import { getCNDate } from "@/lib/rondas/cn-utils";

export { generateTimeSlots };

interface GenerateGridParams {
  controlNocturnoId: string;
  tenantId: string;
  shiftStart: string; // "19:00"
  shiftEnd: string; // "08:00"
}

/**
 * For an installation, determine which hourly slots have an expected ronda.
 */
function calculateExpectedSlots(
  timeSlots: string[],
  programacion: { frecuenciaMinutos: number; horaInicio: string; horaFin: string } | null,
): Map<string, boolean> {
  const result = new Map<string, boolean>();
  timeSlots.forEach((s) => result.set(s, false));

  if (!programacion) return result;

  const [progStartH, progStartM] = programacion.horaInicio.split(":").map(Number);
  const [progEndH, progEndM] = programacion.horaFin.split(":").map(Number);
  const freq = programacion.frecuenciaMinutos;

  let currentMin = progStartH * 60 + progStartM;
  const endMin = progEndH * 60 + progEndM + (progEndH < progStartH ? 24 * 60 : 0);

  while (currentMin < endMin) {
    const normalizedMin = currentMin % (24 * 60);
    const rondaHour = Math.floor(normalizedMin / 60) % 24;
    const slotKey = `${String(rondaHour).padStart(2, "0")}:00`;
    if (result.has(slotKey)) result.set(slotKey, true);
    currentMin += freq;
  }

  return result;
}

/**
 * Determine turno (nocturno/diurno) from a puesto's shift hours.
 */
function turnoFromShift(shiftStart: string): "nocturno" | "diurno" {
  const hour = parseInt(shiftStart.split(":")[0], 10);
  // Night shifts typically start at 19:00-21:00
  return hour >= 18 || hour < 4 ? "nocturno" : "diurno";
}

/**
 * Helper to extract guard info from a pauta/asistencia row with included relations.
 */
function extractGuardInfo(row: {
  replacementGuardia?: { id: string; persona: { firstName: string; lastName: string } } | null;
  plannedGuardia?: { id: string; persona: { firstName: string; lastName: string } } | null;
  puesto: { shiftStart: string; shiftEnd?: string | null };
}): { guardia: { id: string; nombre: string }; turno: "nocturno" | "diurno"; isExtra: boolean } | null {
  const effective = row.replacementGuardia ?? row.plannedGuardia;
  if (!effective) return null;
  const nombre = `${effective.persona.firstName} ${effective.persona.lastName}`.trim();
  return {
    guardia: { id: effective.id, nombre },
    turno: turnoFromShift(row.puesto.shiftStart),
    isExtra: !!row.replacementGuardia,
  };
}

/**
 * Pre-populate guards for a CN installation from available sources.
 *
 * For a nocturnal CN (e.g. 19:00-08:00):
 *   - Night guards: from cnDate where puesto shiftStart >= 18:00 (nocturno)
 *   - Day guards (relevo): from cnDate+1 where puesto shiftStart < 18:00 (diurno)
 *
 * Source priority:
 *   1) OpsAsistenciaDiaria (materialized attendance — has check-in data & actual replacements)
 *   2) OpsPautaMensual (planning — only shiftCode="T" work days)
 *   3) OpsAsignacionGuardia (permanent assignments — fallback)
 *   4) Previous CN (copy — last resort)
 */
async function populateGuards(
  controlInstalacionId: string,
  installationId: string | null,
  tenantId: string,
  cnDate: Date,
): Promise<void> {
  if (!installationId) return;

  // Check if guards already exist (skip if already populated)
  const existingCount = await prisma.opsControlNocturnoGuardia.count({
    where: { controlInstalacionId },
  });
  if (existingCount > 0) return;

  // Day after CN date for diurno relay guards
  const dayDate = new Date(cnDate);
  dayDate.setDate(dayDate.getDate() + 1);

  const guardInclude = {
    plannedGuardia: {
      include: { persona: { select: { firstName: true, lastName: true } } },
    },
    replacementGuardia: {
      include: { persona: { select: { firstName: true, lastName: true } } },
    },
    puesto: { select: { shiftStart: true, shiftEnd: true } },
  } as const;

  const seen = new Set<string>();
  let nightCount = 0;

  async function createGuard(
    info: { guardia: { id: string; nombre: string }; turno: "nocturno" | "diurno"; isExtra: boolean },
    checkInAt?: Date | null,
  ): Promise<void> {
    const key = `${info.guardia.id}-${info.turno}`;
    if (seen.has(key)) return;
    seen.add(key);

    // If asistencia already has check-in, mark as presente
    let status: string = "pendiente";
    let horaLlegada: string | null = null;
    if (checkInAt) {
      status = "presente";
      horaLlegada = new Date(checkInAt).toLocaleTimeString("es-CL", {
        hour: "2-digit", minute: "2-digit", hour12: false, timeZone: "America/Santiago",
      });
    }

    await prisma.opsControlNocturnoGuardia.create({
      data: {
        controlInstalacionId,
        guardiaId: info.guardia.id,
        guardiaNombre: info.guardia.nombre,
        isExtra: info.isExtra,
        turno: info.turno,
        status,
        horaLlegada,
      },
    });

    if (info.turno === "nocturno") nightCount++;
  }

  // ── Source 1: OpsAsistenciaDiaria (materialized attendance) ──
  // Night guards from cnDate
  const nightAsistencia = await prisma.opsAsistenciaDiaria.findMany({
    where: { tenantId, installationId, date: cnDate },
    include: guardInclude,
  });
  const nightFromAsist = nightAsistencia.filter(
    (a: (typeof nightAsistencia)[number]) => turnoFromShift(a.puesto.shiftStart) === "nocturno",
  );

  // Day relay guards from cnDate+1
  const dayAsistencia = await prisma.opsAsistenciaDiaria.findMany({
    where: { tenantId, installationId, date: dayDate },
    include: guardInclude,
  });
  const dayFromAsist = dayAsistencia.filter(
    (a: (typeof dayAsistencia)[number]) => turnoFromShift(a.puesto.shiftStart) === "diurno",
  );

  if (nightFromAsist.length > 0 || dayFromAsist.length > 0) {
    for (const asist of nightFromAsist) {
      const info = extractGuardInfo(asist);
      if (info) await createGuard(info, asist.checkInAt);
    }
    for (const asist of dayFromAsist) {
      const info = extractGuardInfo(asist);
      if (info) await createGuard(info, asist.checkInAt);
    }
    if (seen.size > 0) {
      // Update guardiasRequeridos based on actual night slots
      if (nightCount > 0) {
        await prisma.opsControlNocturnoInstalacion.update({
          where: { id: controlInstalacionId },
          data: { guardiasRequeridos: nightCount },
        });
      }
      return;
    }
  }

  // ── Source 2: OpsPautaMensual (planning — only work days) ──
  // Night guards from cnDate
  const nightPautas = await prisma.opsPautaMensual.findMany({
    where: { tenantId, installationId, date: cnDate, shiftCode: "T" },
    include: guardInclude,
  });
  const nightFromPauta = nightPautas.filter(
    (p: (typeof nightPautas)[number]) => turnoFromShift(p.puesto.shiftStart) === "nocturno",
  );

  // Day relay guards from cnDate+1
  const dayPautas = await prisma.opsPautaMensual.findMany({
    where: { tenantId, installationId, date: dayDate, shiftCode: "T" },
    include: guardInclude,
  });
  const dayFromPauta = dayPautas.filter(
    (p: (typeof dayPautas)[number]) => turnoFromShift(p.puesto.shiftStart) === "diurno",
  );

  if (nightFromPauta.length > 0 || dayFromPauta.length > 0) {
    for (const pauta of nightFromPauta) {
      const info = extractGuardInfo(pauta);
      if (info) await createGuard(info);
    }
    for (const pauta of dayFromPauta) {
      const info = extractGuardInfo(pauta);
      if (info) await createGuard(info);
    }
    if (seen.size > 0) {
      if (nightCount > 0) {
        await prisma.opsControlNocturnoInstalacion.update({
          where: { id: controlInstalacionId },
          data: { guardiasRequeridos: nightCount },
        });
      }
      return;
    }
  }

  // ── Source 3: OpsAsignacionGuardia (permanent assignments) ──
  const asignaciones = await prisma.opsAsignacionGuardia.findMany({
    where: { tenantId, installationId, isActive: true },
    include: {
      guardia: {
        include: { persona: { select: { firstName: true, lastName: true } } },
      },
      puesto: { select: { shiftStart: true, shiftEnd: true } },
    },
  });

  if (asignaciones.length > 0) {
    for (const asig of asignaciones) {
      const turno = turnoFromShift(asig.puesto.shiftStart);
      const key = `${asig.guardiaId}-${turno}`;
      if (seen.has(key)) continue;
      seen.add(key);

      const nombre = `${asig.guardia.persona.firstName} ${asig.guardia.persona.lastName}`.trim();
      await prisma.opsControlNocturnoGuardia.create({
        data: {
          controlInstalacionId,
          guardiaId: asig.guardiaId,
          guardiaNombre: nombre,
          isExtra: false,
          turno,
          status: "pendiente",
        },
      });
      if (turno === "nocturno") nightCount++;
    }
    if (seen.size > 0) {
      if (nightCount > 0) {
        await prisma.opsControlNocturnoInstalacion.update({
          where: { id: controlInstalacionId },
          data: { guardiasRequeridos: nightCount },
        });
      }
      return;
    }
  }

  // ── Source 4: Copy from previous CN ──
  const prevCNInst = await prisma.opsControlNocturnoInstalacion.findFirst({
    where: {
      installationId,
      controlNocturno: { tenantId, date: { lt: cnDate } },
    },
    orderBy: { controlNocturno: { date: "desc" } },
    include: { guardias: true },
  });

  if (prevCNInst?.guardias && prevCNInst.guardias.length > 0) {
    for (const g of prevCNInst.guardias) {
      await prisma.opsControlNocturnoGuardia.create({
        data: {
          controlInstalacionId,
          guardiaId: g.guardiaId,
          guardiaNombre: g.guardiaNombre,
          isExtra: g.isExtra,
          turno: g.turno,
          status: "pendiente",
        },
      });
    }
  }
}

/**
 * Generate or update grid slots for all installations of a CN.
 * Also pre-populates guards from pauta/asignaciones/previous CN.
 */
export async function generateGridSlots(params: GenerateGridParams): Promise<void> {
  const { controlNocturnoId, tenantId, shiftStart, shiftEnd } = params;

  const timeSlots = generateTimeSlots(shiftStart, shiftEnd);

  // Get the CN date for pauta lookup
  const cn = await prisma.opsControlNocturno.findUnique({
    where: { id: controlNocturnoId },
    select: { date: true },
  });
  const cnDate = cn?.date ?? getCNDate(new Date());

  const instalaciones = await prisma.opsControlNocturnoInstalacion.findMany({
    where: { controlNocturnoId },
    include: { rondas: true },
  });

  for (const inst of instalaciones) {
    // ── Ronda slots ──
    const programacion = inst.installationId
      ? await prisma.opsRondaProgramacion.findFirst({
          where: {
            tenantId,
            rondaTemplate: { installationId: inst.installationId },
            isActive: true,
          },
        })
      : null;

    const expectedSlots = calculateExpectedSlots(
      timeSlots,
      programacion
        ? {
            frecuenciaMinutos: programacion.frecuenciaMinutos,
            horaInicio: programacion.horaInicio,
            horaFin: programacion.horaFin,
          }
        : null,
    );

    const totalExpected = Array.from(expectedSlots.values()).filter(Boolean).length;
    await prisma.opsControlNocturnoInstalacion.update({
      where: { id: inst.id },
      data: {
        monitoreoType: programacion ? "rondas" : "manual",
        rondaFrecuencia: programacion?.frecuenciaMinutos ?? null,
        rondasEsperadas: totalExpected,
      },
    });

    for (let i = 0; i < timeSlots.length; i++) {
      const slotHour = timeSlots[i];
      const rondaNumber = i + 1;
      const rondaExpected = expectedSlots.get(slotHour) ?? false;

      const existing = inst.rondas.find((r: (typeof inst.rondas)[number]) => r.rondaNumber === rondaNumber);
      if (existing) {
        if (existing.rondaExpected !== rondaExpected) {
          await prisma.opsControlNocturnoRonda.update({
            where: { id: existing.id },
            data: { rondaExpected },
          });
        }
      } else {
        await prisma.opsControlNocturnoRonda.create({
          data: {
            controlInstalacionId: inst.id,
            rondaNumber,
            horaEsperada: slotHour,
            status: "pendiente",
            rondaExpected,
          },
        });
      }
    }

    // ── Pre-populate guards ──
    await populateGuards(inst.id, inst.installationId, tenantId, cnDate);
  }
}
