/**
 * Tenant helpers - multi-tenancy
 * Hasta tener Auth: se usa tenant por defecto "gard".
 * Con Auth: session.user.tenantId reemplaza getDefaultTenantId().
 */

import { prisma } from '@/lib/prisma';

const DEFAULT_TENANT_SLUG = 'gard';

let cachedTenantId: string | null = null;

/**
 * Obtiene el ID del tenant por defecto (Gard).
 * Usado cuando no hay sesión (webhooks, APIs públicas) o como fallback.
 * Con Auth.js, las rutas internas usarán session.user.tenantId.
 */
export async function getDefaultTenantId(): Promise<string> {
  if (cachedTenantId) return cachedTenantId;
  const tenant = await prisma.tenant.findUnique({
    where: { slug: DEFAULT_TENANT_SLUG, active: true },
  });
  if (!tenant) {
    throw new Error(`Tenant "${DEFAULT_TENANT_SLUG}" no encontrado. Ejecutar migraciones y seed.`);
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
