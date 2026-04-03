/**
 * Centralized auth helper for Portal Guardia subroutes.
 *
 * Validates that guardiaId exists in the DB and returns
 * the verified tenantId (from DB, never from the request).
 */

import { prisma } from "@/lib/prisma";

export interface PortalGuardiaAuthResult {
  guardiaId: string;
  tenantId: string;
}

/**
 * Resolves and validates a guardiaId, returning the DB-verified tenantId.
 * Returns null if the guard doesn't exist or is inactive.
 */
export async function requirePortalGuardiaAuth(
  guardiaId: string | null | undefined,
): Promise<PortalGuardiaAuthResult | null> {
  if (!guardiaId) return null;

  const guardia = await prisma.opsGuardia.findUnique({
    where: { id: guardiaId },
    select: { id: true, tenantId: true, isActive: true },
  });

  if (!guardia || !guardia.isActive) return null;

  return {
    guardiaId: guardia.id,
    tenantId: guardia.tenantId,
  };
}
