/**
 * Digest diario de cumplimiento de rondas (Fase 19).
 *
 * Fórmula (documentada): cumplimiento = rondas con status "completada" ÷ rondas
 * PROGRAMADAS del día (ejecuciones no ad-hoc con scheduledAt dentro del día
 * anterior en hora de Chile). Todo lo demás — incompleta, no_realizada,
 * cerrada_auto/admin, o aún pendiente/en_curso — cuenta como NO cumplida.
 * Las rondas libres (ad-hoc) no son programadas y quedan fuera del ratio.
 *
 * Semáforo por instalación (umbrales en Setting rondas_notif_policy):
 * 🔴 pct < digestRedBelow · 🟠 entre ambos · ✅ pct >= digestGreenFrom.
 * El desglose va ORDENADO de peor a mejor: las fallas gritan primero.
 */

import { prisma } from "@/lib/prisma";
import type { RondasNotifPolicy } from "@/lib/rondas/notification-policy";
import { onlyActiveInstallationEjecucion } from "@/lib/rondas/active-installation-filter";

export interface RondasDigestInstallation {
  installationId: string | null;
  name: string;
  total: number;
  completadas: number;
  pct: number;
}

export interface RondasDigestSummary {
  total: number;
  completadas: number;
  pct: number;
  installations: RondasDigestInstallation[];
}

export function semaforo(pct: number, policy: RondasNotifPolicy): string {
  if (pct < policy.digestRedBelow) return "🔴";
  if (pct < policy.digestGreenFrom) return "🟠";
  return "✅";
}

export async function buildRondasDigestSummary(
  tenantId: string,
  dayStart: Date,
  dayEnd: Date,
): Promise<RondasDigestSummary> {
  const rows = await prisma.opsRondaEjecucion.findMany({
    where: {
      tenantId,
      isAdHoc: false,
      scheduledAt: { gte: dayStart, lte: dayEnd },
      ...onlyActiveInstallationEjecucion,
    },
    select: {
      status: true,
      installationId: true,
      rondaTemplate: {
        select: { installationId: true, installation: { select: { id: true, name: true } } },
      },
      installation: { select: { id: true, name: true } },
    },
  });

  const byInstallation = new Map<string, RondasDigestInstallation>();
  let completadas = 0;

  for (const row of rows) {
    const instId = row.installationId ?? row.rondaTemplate?.installationId ?? null;
    const name =
      row.installation?.name ?? row.rondaTemplate?.installation?.name ?? "Sin instalación";
    const key = instId ?? "__none__";
    const entry =
      byInstallation.get(key) ?? { installationId: instId, name, total: 0, completadas: 0, pct: 0 };
    entry.total++;
    if (row.status === "completada") {
      entry.completadas++;
      completadas++;
    }
    byInstallation.set(key, entry);
  }

  const installations = [...byInstallation.values()]
    .map((i) => ({ ...i, pct: i.total > 0 ? Math.round((i.completadas / i.total) * 100) : 0 }))
    // Peor a mejor; a igual %, la instalación con más rondas programadas primero.
    .sort((a, b) => a.pct - b.pct || b.total - a.total);

  const total = rows.length;
  return {
    total,
    completadas,
    pct: total > 0 ? Math.round((completadas / total) * 100) : 0,
    installations,
  };
}

export function digestHeadline(summary: RondasDigestSummary): string {
  return `Rondas de ayer: ${summary.pct}% cumplimiento (${summary.completadas} de ${summary.total} realizadas)`;
}

export function installationLine(i: RondasDigestInstallation, policy: RondasNotifPolicy): string {
  return `${semaforo(i.pct, policy)} ${i.name} ${i.completadas}/${i.total} (${i.pct}%)`;
}
