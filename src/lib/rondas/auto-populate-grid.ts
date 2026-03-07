/**
 * Auto-populate Control Nocturno grid from ronda completions.
 *
 * When a ronda completes, this function finds the matching CN ronda slot
 * (by installation + hour) and marks it as completed with trust score data.
 *
 * CN grid has 12 hourly slots: R1=20:00, R2=21:00, ... R12=07:00
 */

import { prisma } from "@/lib/prisma";
import { toChileTime } from "@/lib/rondas/timezone";
import { getCNDate } from "@/lib/rondas/cn-utils";

const RONDA_HOURS = [20, 21, 22, 23, 0, 1, 2, 3, 4, 5, 6, 7];

/**
 * Determina a qué slot R1-R12 pertenece una hora dada.
 * Cada slot cubre 60 minutos: R1 = 20:00-20:59, R2 = 21:00-21:59, etc.
 * Retorna rondaNumber (1-12) o null si la hora está fuera del rango nocturno (8-19).
 */
function findSlotForHour(chileHour: number): number | null {
  const idx = RONDA_HOURS.indexOf(chileHour);
  if (idx === -1) return null;
  return idx + 1;
}

interface AutoPopulateParams {
  tenantId: string;
  ejecucionId: string;
  installationId: string;
  completedAt: Date;
  trustScore: number;
  status: string; // "completada" | "incompleta"
}

/**
 * Auto-populate a CN ronda slot when a ronda completes.
 * Only populates if:
 * 1. A CN exists for tonight
 * 2. The CN has an instalacion row for this installation
 * 3. The matching ronda slot hasn't been manually overridden
 *
 * Returns true if a slot was populated, false otherwise.
 */
export async function autoPopulateCNFromRonda(params: AutoPopulateParams): Promise<boolean> {
  try {
    const { tenantId, ejecucionId, installationId, completedAt, trustScore, status } = params;

    const chileTime = toChileTime(completedAt);
    const rondaNumber = findSlotForHour(chileTime.getHours());
    if (!rondaNumber) return false;

    const cnDate = getCNDate(completedAt);

    // Find the CN for this date
    const cn = await prisma.opsControlNocturno.findFirst({
      where: {
        tenantId,
        date: cnDate,
        autoPopulateMode: { in: ["auto", "hybrid"] },
      },
      select: { id: true },
    });
    if (!cn) return false;

    // Find the CN instalacion row
    const cnInst = await prisma.opsControlNocturnoInstalacion.findFirst({
      where: {
        controlNocturnoId: cn.id,
        installationId,
      },
      select: { id: true },
    });
    if (!cnInst) return false;

    // Find or create the ronda slot
    const cnRonda = await prisma.opsControlNocturnoRonda.findUnique({
      where: {
        controlInstalacionId_rondaNumber: {
          controlInstalacionId: cnInst.id,
          rondaNumber,
        },
      },
      select: { id: true, manualOverride: true },
    });

    if (!cnRonda) return false;

    // Don't overwrite manual overrides
    if (cnRonda.manualOverride) return false;

    const trustColor = trustScore >= 80 ? "green" : trustScore >= 60 ? "yellow" : "red";
    const horaMarcada = `${String(chileTime.getHours()).padStart(2, "0")}:${String(chileTime.getMinutes()).padStart(2, "0")}`;

    await prisma.opsControlNocturnoRonda.update({
      where: { id: cnRonda.id },
      data: {
        status: status === "completada" ? "completada" : "omitida",
        horaMarcada,
        ejecucionRondaId: ejecucionId,
        autoPopulated: true,
        trustScore,
        trustColor,
      },
    });

    // Also mark auto-asistencia on the instalacion
    await prisma.opsControlNocturnoInstalacion.update({
      where: { id: cnInst.id },
      data: { autoAsistencia: true },
    });

    return true;
  } catch (error) {
    console.error("[AUTO_POPULATE_CN] Error:", error);
    return false;
  }
}
