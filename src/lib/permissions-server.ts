/**
 * Permissions Server — Resolución de permisos desde la BD
 *
 * Server-only: usa prisma para queries. No importar en client components.
 */

import { prisma } from "@/lib/prisma";
import {
  type RolePermissions,
  getDefaultPermissions,
  EMPTY_PERMISSIONS,
  normalizeRole,
  mergeRolePermissions,
  getEffectiveLevel,
  LEVEL_RANK,
} from "@/lib/permissions";

// ── In-memory cache (TTL 5 min) ──

interface CacheEntry {
  permissions: RolePermissions;
  expiresAt: number;
}

const CACHE_TTL_MS = 5 * 60 * 1000; // 5 min
const cache = new Map<string, CacheEntry>();

function getCached(id: string): RolePermissions | null {
  const entry = cache.get(id);
  if (!entry) return null;
  if (Date.now() > entry.expiresAt) {
    cache.delete(id);
    return null;
  }
  return entry.permissions;
}

function setCache(id: string, perms: RolePermissions): void {
  cache.set(id, { permissions: perms, expiresAt: Date.now() + CACHE_TTL_MS });
}

/** Invalidar cache de un template (cuando se edita) */
export function invalidateTemplateCache(templateId: string): void {
  cache.delete(templateId);
}

/** Invalidar todo el cache (cuando se hace cambio masivo) */
export function invalidateAllCache(): void {
  cache.clear();
}

// ── Main resolution ──

/**
 * Resuelve los permisos de un usuario.
 *
 * 1. Si tiene roleTemplateId → busca en BD (cached)
 * 2. Si no → usa DEFAULT_ROLE_PERMISSIONS según su role legacy
 */
export async function resolvePermissions(user: {
  role: string;
  roleTemplateId?: string | null;
}): Promise<RolePermissions> {
  const normalizedRole = normalizeRole(user.role);
  const defaultPerms = getDefaultPermissions(normalizedRole);

  // Regla de negocio: propietario siempre mantiene acceso total.
  if (normalizedRole === "owner") {
    return defaultPerms;
  }

  // Si tiene template asignado, resolver desde BD
  if (user.roleTemplateId) {
    const cached = getCached(user.roleTemplateId);
    if (cached) {
      const merged = mergeRolePermissions(defaultPerms, cached);
      return ensureSupervisorSupervisionAccess(normalizedRole, merged);
    }

    const template = await prisma.roleTemplate.findUnique({
      where: { id: user.roleTemplateId },
      select: { permissions: true },
    });

    if (template && template.permissions) {
      const perms = template.permissions as unknown as RolePermissions;
      setCache(user.roleTemplateId, perms);
      const merged = mergeRolePermissions(defaultPerms, perms);
      return ensureSupervisorSupervisionAccess(normalizedRole, merged);
    }
  }

  // Fallback a defaults por rol legacy
  return ensureSupervisorSupervisionAccess(normalizedRole, defaultPerms);
}

/**
 * Regla de negocio: el rol "supervisor" siempre debe tener al menos vista al submódulo
 * ops.supervision (dashboard y visitas). Evita que un template editado quite el acceso.
 */
function ensureSupervisorSupervisionAccess(
  role: string,
  perms: RolePermissions,
): RolePermissions {
  if (role !== "supervisor") return perms;
  const level = getEffectiveLevel(perms, "ops", "supervision");
  if (LEVEL_RANK[level] >= LEVEL_RANK.view) return perms;
  return {
    ...perms,
    submodules: {
      ...perms.submodules,
      "ops.supervision": "full",
    },
  };
}

/**
 * Resuelve permisos dado solo el ID del admin.
 * Útil para API routes.
 */
export async function resolvePermissionsById(
  adminId: string,
): Promise<RolePermissions> {
  const admin = await prisma.admin.findUnique({
    where: { id: adminId },
    select: { role: true, roleTemplateId: true },
  });

  if (!admin) return EMPTY_PERMISSIONS;

  return resolvePermissions({
    role: admin.role,
    roleTemplateId: admin.roleTemplateId,
  });
}

/**
 * Helper para usar en API routes: obtener permisos desde el auth context.
 */
export async function getPermissionsFromAuth(auth: {
  userId: string;
  userRole: string;
  roleTemplateId?: string | null;
}): Promise<RolePermissions> {
  return resolvePermissions({
    role: auth.userRole,
    roleTemplateId: auth.roleTemplateId,
  });
}

// ── Page guard helpers ──

import { canView, canEdit, hasModuleAccess, hasCapability } from "./permissions";
import type { ModuleKey, CapabilityKey } from "./permissions";

export { canView, canEdit, hasModuleAccess, hasCapability };
export type { ModuleKey, CapabilityKey };

interface SessionUser {
  role: string;
  roleTemplateId?: string | null;
  [key: string]: unknown;
}

/**
 * Resolver permisos desde la sesión de auth.
 * Usa el cache del template (5min TTL) así que es barato.
 * 
 * Uso en page.tsx:
 *   const perms = await resolvePagePerms(session.user);
 *   if (!canView(perms, "ops")) redirect("/hub");
 */
export async function resolvePagePerms(user: SessionUser): Promise<RolePermissions> {
  return resolvePermissions({
    role: user.role,
    roleTemplateId: user.roleTemplateId,
  });
}
