/**
 * Centralized auth helper for Portal Guardia subroutes.
 *
 * Validates that guardiaId exists in the DB and returns
 * the verified tenantId (from DB, never from the request).
 */

import { prisma } from "@/lib/prisma";
import { resolveTenantAccess } from "@/lib/platform/tenant-lifecycle";

export interface PortalGuardiaAuthResult {
  guardiaId: string;
  tenantId: string;
}

/**
 * Resolves and validates a guardiaId, returning the DB-verified tenantId.
 * Returns null if the guard doesn't exist or the tenant is blocked without
 * marcación grace.
 */
export async function requirePortalGuardiaAuth(
  guardiaId: string | null | undefined,
): Promise<PortalGuardiaAuthResult | null> {
  if (!guardiaId) return null;

  const guardia = await prisma.opsGuardia.findUnique({
    where: { id: guardiaId },
    select: { id: true, tenantId: true },
  });

  if (!guardia) return null;

  try {
    const access = await resolveTenantAccess(guardia.tenantId);
    if (access.mode === "blocked" && !access.marcacionAllowed) {
      return null;
    }
  } catch (error) {
    console.warn("[portal-guardia-auth] resolveTenantAccess failed:", error);
  }

  return {
    guardiaId: guardia.id,
    tenantId: guardia.tenantId,
  };
}
