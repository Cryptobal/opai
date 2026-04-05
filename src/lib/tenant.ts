/**
 * Tenant helpers - multi-tenancy
 *
 * IMPORTANT: getDefaultTenantId() is DEPRECATED for production use.
 * Use session.user.tenantId (via requireAuth) for authenticated routes.
 * Use resolveTenantFromRequest() for public routes.
 * getSystemTenantId() is only for seeds, migrations, and internal scripts.
 */

import { prisma } from "@/lib/prisma";

const DEFAULT_TENANT_SLUG = "gard";

let cachedTenantId: string | null = null;

/**
 * @deprecated Use session.user.tenantId or resolveTenantFromRequest() instead.
 * Only kept for backward compatibility — will be removed in future.
 */
export async function getDefaultTenantId(): Promise<string> {
  console.warn(
    "[DEPRECATED] getDefaultTenantId() called — migrate to session.user.tenantId or resolveTenantFromRequest()",
  );
  return getSystemTenantId();
}

/**
 * Obtiene el ID del tenant del sistema (Gard).
 * SOLO usar en: seeds, migrations, scripts internos, y webhooks sin tenant context.
 * NUNCA usar en API routes de producción.
 */
export async function getSystemTenantId(): Promise<string> {
  if (cachedTenantId) return cachedTenantId;
  const tenant = await prisma.tenant.findUnique({
    where: { slug: DEFAULT_TENANT_SLUG, active: true },
  });
  if (!tenant) {
    throw new Error(
      `Tenant "${DEFAULT_TENANT_SLUG}" no encontrado. Ejecutar seed.`,
    );
  }
  cachedTenantId = tenant.id;
  return tenant.id;
}

/**
 * Limpia la caché (útil en tests o tras crear tenant).
 */
export function clearTenantCache(): void {
  cachedTenantId = null;
}

/**
 * Resolve a tenant by its URL slug. Used by public API routes.
 * Returns null if tenant not found or inactive.
 */
export async function resolveTenantFromSlug(
  slug: string,
): Promise<{ id: string; name: string; slug: string } | null> {
  if (!slug) return null;
  return prisma.tenant.findUnique({
    where: { slug, active: true },
    select: { id: true, name: true, slug: true },
  });
}
