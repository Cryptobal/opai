"use client";

import Link from "next/link";
import type { InstallationRosterBlocker } from "@/lib/crm/installation-roster-guard";

export function InstallationRosterBlockers({
  blockers,
  loading,
}: {
  blockers: InstallationRosterBlocker[];
  loading?: boolean;
}) {
  if (loading) {
    return <p className="text-sm text-ds-text-3">Revisando trabajadores en rol…</p>;
  }
  if (blockers.length === 0) return null;

  return (
    <div className="space-y-2 rounded-md border border-status-warn-border bg-status-warn-soft p-3 text-status-warn-fg">
      <p className="text-sm font-medium">
        No se puede cerrar: hay {blockers.length} trabajador(es) en rol, incluida licencia médica.
        Finiquita o desasigna primero.
      </p>
      <ul className="space-y-1 text-sm">
        {blockers.map((b) => (
          <li key={`${b.installationId}-${b.guardiaId}`}>
            <Link
              href={`/personas/guardias/${b.guardiaId}`}
              className="underline underline-offset-2"
            >
              {b.name}
            </Link>
            {b.onMedicalLeave ? " · licencia médica" : ""}
          </li>
        ))}
      </ul>
    </div>
  );
}

export async function fetchInstallationRosterBlockers(
  installationId: string,
): Promise<InstallationRosterBlocker[]> {
  const res = await fetch(`/api/crm/installations/${installationId}/roster-blockers`);
  const payload = await res.json();
  if (!res.ok || !payload.success) return [];
  return (payload.data?.blockers ?? []) as InstallationRosterBlocker[];
}
