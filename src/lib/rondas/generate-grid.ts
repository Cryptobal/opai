/**
 * Generate grid slots for Control Nocturno.
 *
 * Called when a turno is linked to a CN. Generates hourly slots
 * with rondaExpected pre-calculated based on programacion data,
 * and pre-populates guards from pauta mensual (the ONLY source of truth).
 */

import { prisma } from "@/lib/prisma";
import { generateTimeSlots } from "@/lib/rondas/grid-utils";
import { getCNDate } from "@/lib/rondas/cn-utils";
import { formatPersonName } from "@/lib/personas";

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
 * Resolve guards from pauta mensual — the ONLY source of truth.
 * Nocturno guards come from cnDate, diurno guards from cnDate + 1 day.
 * No fallback to asignaciones or previous CN.
 */
async function resolveGuardsFromSources(
  installationId: string,
  tenantId: string,
  cnDate: Date,
): Promise<Array<{ guardiaId: string; guardiaNombre: string; isExtra: boolean; turno: "nocturno" | "diurno" }>> {
  const result: Array<{ guardiaId: string; guardiaNombre: string; isExtra: boolean; turno: "nocturno" | "diurno" }> = [];
  const seen = new Set<string>();

  // Diurno date = cnDate + 1 day (next morning)
  const diurnoDate = new Date(cnDate);
  diurnoDate.setUTCDate(diurnoDate.getUTCDate() + 1);

  const pautaInclude = {
    plannedGuardia: {
      include: { persona: { select: { firstName: true, lastName: true } } },
    },
    replacementGuardia: {
      include: { persona: { select: { firstName: true, lastName: true } } },
    },
    puesto: { select: { shiftStart: true } },
  } as const;

  // ── Nocturno: pauta for cnDate, only puestos with nocturno shift ──
  const pautasNoc = await prisma.opsPautaMensual.findMany({
    where: { tenantId, installationId, date: cnDate, shiftCode: "T" },
    include: pautaInclude,
  });

  for (const pauta of pautasNoc) {
    const turno = pauta.puesto?.shiftStart ? turnoFromShift(pauta.puesto.shiftStart) : "nocturno";
    if (turno !== "nocturno") continue; // skip diurno puestos from this date
    const effective = pauta.replacementGuardia ?? pauta.plannedGuardia;
    if (!effective) {
      const ppcKey = `ppc-${pauta.id}-nocturno`;
      if (!seen.has(ppcKey)) {
        seen.add(ppcKey);
        result.push({ guardiaId: "", guardiaNombre: "PPC", isExtra: false, turno: "nocturno" });
      }
      continue;
    }
    const key = `${effective.id}-nocturno`;
    if (seen.has(key)) continue;
    seen.add(key);
    result.push({
      guardiaId: effective.id,
      guardiaNombre: formatPersonName(effective.persona.firstName, effective.persona.lastName),
      isExtra: !!pauta.replacementGuardia,
      turno: "nocturno",
    });
  }

  // ── Diurno: pauta for cnDate+1, only puestos with diurno shift ──
  const pautasDiu = await prisma.opsPautaMensual.findMany({
    where: { tenantId, installationId, date: diurnoDate, shiftCode: "T" },
    include: pautaInclude,
  });

  for (const pauta of pautasDiu) {
    const turno = pauta.puesto?.shiftStart ? turnoFromShift(pauta.puesto.shiftStart) : "nocturno";
    if (turno !== "diurno") continue; // skip nocturno puestos from this date
    const effective = pauta.replacementGuardia ?? pauta.plannedGuardia;
    if (!effective) {
      const ppcKey = `ppc-${pauta.id}-diurno`;
      if (!seen.has(ppcKey)) {
        seen.add(ppcKey);
        result.push({ guardiaId: "", guardiaNombre: "PPC", isExtra: false, turno: "diurno" });
      }
      continue;
    }
    const key = `${effective.id}-diurno`;
    if (seen.has(key)) continue;
    seen.add(key);
    result.push({
      guardiaId: effective.id,
      guardiaNombre: formatPersonName(effective.persona.firstName, effective.persona.lastName),
      isExtra: !!pauta.replacementGuardia,
      turno: "diurno",
    });
  }

  return result;
}

/**
 * Pre-populate/refresh guards for a CN installation.
 * Merges assignment data with existing guards:
 * - Keeps guards that were manually modified (non-pendiente status, replacements)
 * - Only adds guards that are missing (new assignments)
 * - Removes auto-populated guards that are no longer in assignment data
 * - Never deletes then recreates — avoids flicker during polling
 */
async function populateGuards(
  controlInstalacionId: string,
  installationId: string | null,
  tenantId: string,
  cnDate: Date,
): Promise<number> {
  if (!installationId) return 0;

  const existing = await prisma.opsControlNocturnoGuardia.findMany({
    where: { controlInstalacionId },
  });

  // Get fresh guard data from sources
  const resolved = await resolveGuardsFromSources(installationId, tenantId, cnDate);

  // Count nocturno guards from resolved plan data — this IS guardiasRequeridos
  const nocturnoRequired = resolved.filter((g) => g.turno === "nocturno").length;

  // Build lookup keys for existing and resolved guards
  // PPC entries use guardiaNombre="PPC" as key since guardiaId is null/empty
  const guardKey = (guardiaId: string | null, nombre: string, turno: string) =>
    guardiaId ? `${guardiaId}-${turno}` : `ppc-${nombre}-${turno}`;
  const existingKeys = new Set(existing.map((g) => guardKey(g.guardiaId, g.guardiaNombre, g.turno)));
  const resolvedKeys = new Set(resolved.map((g) => guardKey(g.guardiaId || null, g.guardiaNombre, g.turno)));

  // Add guards that don't already exist
  const addedKeys = new Set<string>();
  for (const guard of resolved) {
    const key = guardKey(guard.guardiaId || null, guard.guardiaNombre, guard.turno);
    if (existingKeys.has(key) || addedKeys.has(key)) continue;
    addedKeys.add(key);
    await prisma.opsControlNocturnoGuardia.create({
      data: {
        controlInstalacionId,
        guardiaId: guard.guardiaId || null,
        guardiaNombre: guard.guardiaNombre,
        isExtra: guard.isExtra,
        turno: guard.turno,
        status: "pendiente",
      },
    });
  }

  // Remove auto-populated guards that are no longer in assignment data
  // (only remove "pendiente" guards without manual modifications)
  const staleGuards = existing.filter(
    (g) =>
      g.status === "pendiente" &&
      g.reemplazaDe == null &&
      !g.isExtra &&
      !resolvedKeys.has(guardKey(g.guardiaId, g.guardiaNombre, g.turno)),
  );
  if (staleGuards.length > 0) {
    await prisma.opsControlNocturnoGuardia.deleteMany({
      where: { id: { in: staleGuards.map((g) => g.id) } },
    });
  }

  return nocturnoRequired;
}

/**
 * Generate or update grid slots for all installations of a CN.
 * Also pre-populates guards from pauta mensual.
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
    // Cada instalación se procesa de forma independiente: si una falla
    // (p.ej. timeout puntual o un drift de schema en pauta_mensual), las
    // demás siguen recibiendo su sync de rondaExpected. Sin esto, un único
    // error abortaría el for-loop y dejaba todas las instalaciones
    // restantes con rondaExpected=true por defecto del schema.
    try {
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

      // ── Pre-populate guards & sync guardiasRequeridos from pauta ──
      // Aislado en su propio try porque depende de pauta_mensual y un fallo
      // ahí no debería invalidar el sync de rondaExpected ya hecho arriba.
      try {
        const nocturnoRequired = await populateGuards(inst.id, inst.installationId, tenantId, cnDate);
        if (inst.guardiasRequeridos !== nocturnoRequired) {
          await prisma.opsControlNocturnoInstalacion.update({
            where: { id: inst.id },
            data: { guardiasRequeridos: nocturnoRequired },
          });
        }
      } catch (err) {
        console.error(
          `[generateGridSlots] populateGuards failed for inst ${inst.id} (installation ${inst.installationId ?? "null"}):`,
          err,
        );
      }
    } catch (err) {
      console.error(
        `[generateGridSlots] inst loop failed for inst ${inst.id} (installation ${inst.installationId ?? "null"}):`,
        err,
      );
    }
  }
}
