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

const RONDA_HOURS = [
  "20:00", "21:00", "22:00", "23:00",
  "00:00", "01:00", "02:00", "03:00",
  "04:00", "05:00", "06:00", "07:00",
];

/**
 * Find the closest CN ronda slot hour for a given Chile local hour.
 * Returns the ronda number (1-12) or null if outside the night window.
 */
function findClosestRondaNumber(chileHour: number, chileMinute: number): number | null {
  // Night window: 19:30 - 07:30
  // Map to the closest full hour in RONDA_HOURS
  const totalMinutes = chileHour * 60 + chileMinute;

  // Before 19:30 or after 07:30 → not in night window
  if (totalMinutes >= 7 * 60 + 30 && totalMinutes < 19 * 60 + 30) return null;

  // Find the closest hour
  let bestIdx = 0;
  let bestDist = Infinity;

  for (let i = 0; i < RONDA_HOURS.length; i++) {
    const [h, m] = RONDA_HOURS[i].split(":").map(Number);
    let slotMinutes = h * 60 + m;
    // Normalize for overnight: hours 0-7 become 24-31
    if (slotMinutes < 12 * 60) slotMinutes += 24 * 60;

    let nowMinutes = totalMinutes;
    if (nowMinutes < 12 * 60) nowMinutes += 24 * 60;

    const dist = Math.abs(nowMinutes - slotMinutes);
    if (dist < bestDist) {
      bestDist = dist;
      bestIdx = i;
    }
  }

  // Only match if within 30 minutes of the slot
  if (bestDist > 30) return null;

  return bestIdx + 1; // rondaNumber is 1-based
}

/**
 * Get the CN date for a given completion time.
 * Same logic as turno start: before 8AM → previous day.
 */
function getCNDate(completedAt: Date): Date {
  const chile = toChileTime(completedAt);
  if (chile.getHours() < 8) {
    chile.setDate(chile.getDate() - 1);
  }
  chile.setHours(0, 0, 0, 0);
  return chile;
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
    const rondaNumber = findClosestRondaNumber(chileTime.getHours(), chileTime.getMinutes());
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
