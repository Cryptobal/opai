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
 * Pre-populate guards for a CN installation from available sources.
 * Priority: 1) Pauta mensual for today  2) Active asignaciones  3) Previous CN
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

  // ── Source 1: Pauta mensual for today ──
  const pautas = await prisma.opsPautaMensual.findMany({
    where: {
      tenantId,
      installationId,
      date: cnDate,
    },
    include: {
      plannedGuardia: {
        include: { persona: { select: { firstName: true, lastName: true } } },
      },
      replacementGuardia: {
        include: { persona: { select: { firstName: true, lastName: true } } },
      },
      puesto: { select: { shiftStart: true } },
    },
  });

  if (pautas.length > 0) {
    const seen = new Set<string>();
    for (const pauta of pautas) {
      const effective = pauta.replacementGuardia ?? pauta.plannedGuardia;
      if (!effective) continue;
      const key = `${effective.id}-${turnoFromShift(pauta.puesto.shiftStart)}`;
      if (seen.has(key)) continue;
      seen.add(key);

      const nombre = `${effective.persona.firstName} ${effective.persona.lastName}`.trim();
      await prisma.opsControlNocturnoGuardia.create({
        data: {
          controlInstalacionId,
          guardiaId: effective.id,
          guardiaNombre: nombre,
          isExtra: !!pauta.replacementGuardia,
          turno: turnoFromShift(pauta.puesto.shiftStart),
          status: "pendiente",
        },
      });
    }
    if (seen.size > 0) return; // Pautas found, done
  }

  // ── Source 2: Active asignaciones ──
  const asignaciones = await prisma.opsAsignacionGuardia.findMany({
    where: { tenantId, installationId, isActive: true },
    include: {
      guardia: {
        include: { persona: { select: { firstName: true, lastName: true } } },
      },
      puesto: { select: { shiftStart: true } },
    },
  });

  if (asignaciones.length > 0) {
    const seen = new Set<string>();
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
    }
    if (seen.size > 0) return;
  }

  // ── Source 3: Copy from previous CN ──
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

      const existing = inst.rondas.find((r) => r.rondaNumber === rondaNumber);
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
