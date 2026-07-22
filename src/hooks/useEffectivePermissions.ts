"use client";

import { usePermissions } from "@/lib/permissions-context";
import { useRoleSimulation } from "@/contexts/RoleSimulationContext";

/** Permisos efectivos: simulados cuando owner/admin usa "Ver como…". */
export function useEffectivePermissions() {
  const realPerms = usePermissions();
  const { effectivePermissions, isSimulating } = useRoleSimulation();
  return isSimulating ? effectivePermissions : realPerms;
}
