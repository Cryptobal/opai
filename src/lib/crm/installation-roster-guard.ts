import { prisma } from "@/lib/prisma";
import { formatPersonName } from "@/lib/personas";
import { todayInChile } from "@/lib/dates-cl";
import { parseDateOnly } from "@/lib/ops";

export type InstallationRosterBlocker = {
  installationId: string;
  guardiaId: string;
  name: string;
  lifecycleStatus: string;
  onMedicalLeave: boolean;
};

export const INSTALLATION_ROSTER_CONFLICT = "INSTALLATION_HAS_ACTIVE_ROSTER";

export function rosterConflictPayload(blockers: InstallationRosterBlocker[]) {
  return {
    success: false as const,
    error: formatRosterConflictError(blockers),
    code: INSTALLATION_ROSTER_CONFLICT,
    blockers,
  };
}

export function formatRosterConflictError(blockers: InstallationRosterBlocker[]): string {
  const names = blockers
    .slice(0, 5)
    .map((b) => `${b.name}${b.onMedicalLeave ? " (licencia médica)" : ""}`)
    .join(", ");
  const extra = blockers.length > 5 ? ` y ${blockers.length - 5} más` : "";
  return `No se puede cerrar la instalación: hay ${blockers.length} trabajador(es) en rol. Finiquita o desasigna primero: ${names}${extra}.`;
}

export async function findActiveInstallationRoster(
  tenantId: string,
  installationIds: string[],
): Promise<InstallationRosterBlocker[]> {
  const ids = [...new Set(installationIds.filter(Boolean))];
  if (ids.length === 0) return [];

  const asignaciones = await prisma.opsAsignacionGuardia.findMany({
    where: { tenantId, installationId: { in: ids }, isActive: true },
    select: {
      installationId: true,
      guardiaId: true,
      guardia: {
        select: {
          lifecycleStatus: true,
          persona: { select: { firstName: true, lastName: true } },
        },
      },
    },
  });

  if (asignaciones.length === 0) return [];

  const guardiaIds = [...new Set(asignaciones.map((a) => a.guardiaId))];
  const today = parseDateOnly(todayInChile());

  const licencias = await prisma.opsGuardEvent.findMany({
    where: {
      tenantId,
      guardiaId: { in: guardiaIds },
      category: "ausencia",
      subtype: "licencia_medica",
      status: { notIn: ["cancelled", "rejected"] },
      startDate: { lte: today },
      OR: [{ endDate: null }, { endDate: { gte: today } }],
    },
    select: { guardiaId: true },
  });
  const onLeave = new Set(licencias.map((l) => l.guardiaId));

  return asignaciones.map((row) => ({
    installationId: row.installationId,
    guardiaId: row.guardiaId,
    name: formatPersonName(row.guardia.persona.firstName, row.guardia.persona.lastName) || "Guardia",
    lifecycleStatus: row.guardia.lifecycleStatus,
    onMedicalLeave: onLeave.has(row.guardiaId),
  }));
}

export async function findActiveRosterForInstallation(
  tenantId: string,
  installationId: string,
): Promise<InstallationRosterBlocker[]> {
  return findActiveInstallationRoster(tenantId, [installationId]);
}
