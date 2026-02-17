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
  let effectiveRole = normalizedRole;

  if (user.roleTemplateId) {
    const cached = getCached(user.roleTemplateId);
    if (cached) {
      const merged = mergeRolePermissions(defaultPerms, cached);
      // Recuperar slug del template para detectar si es supervisor
      const tpl = await prisma.roleTemplate.findUnique({
        where: { id: user.roleTemplateId },
        select: { slug: true },
      });
      if (tpl?.slug) effectiveRole = normalizeRole(tpl.slug);
      return ensureSupervisorSupervisionAccess(effectiveRole, merged);
    }

    const template = await prisma.roleTemplate.findUnique({
      where: { id: user.roleTemplateId },
      select: { permissions: true, slug: true },
    });

    if (template && template.permissions) {
      const perms = template.permissions as unknown as RolePermissions;
      setCache(user.roleTemplateId, perms);
      if (template.slug) effectiveRole = normalizeRole(template.slug);
      const merged = mergeRolePermissions(defaultPerms, perms);
      return ensureSupervisorSupervisionAccess(effectiveRole, merged);
    }
  }

  // Fallback a defaults por rol legacy
  return ensureSupervisorSupervisionAccess(effectiveRole, defaultPerms);
}

/**
 * Regla de negocio: el rol "supervisor" siempre debe tener acceso a los módulos
 * críticos de su función (supervisión, rendiciones, hub supervisor).
 * Evita que un template editado quite acceso esencial.
 */
function ensureSupervisorSupervisionAccess(
  role: string,
  perms: RolePermissions,
): RolePermissions {
  if (role !== "supervisor") return perms;

  let patched = { ...perms };
  let submodules = { ...perms.submodules };
  let capabilities = { ...perms.capabilities };
  let modules = { ...perms.modules };
  let changed = false;

  // 1. ops.supervision siempre full
  if (LEVEL_RANK[getEffectiveLevel(perms, "ops", "supervision")] < LEVEL_RANK.view) {
    submodules["ops.supervision"] = "full";
    changed = true;
  }

  // 2. Hub al menos "view" (para que "Inicio" aparezca en sidebar)
  if (LEVEL_RANK[modules.hub ?? "none"] < LEVEL_RANK.view) {
    modules.hub = "view";
    changed = true;
  }

  // 3. Ops al menos "view" (para sidebar)
  if (LEVEL_RANK[modules.ops ?? "none"] < LEVEL_RANK.view) {
    modules.ops = "view";
    changed = true;
  }

  // 3. finance.rendiciones al menos "edit" (crear rendiciones)
  if (LEVEL_RANK[getEffectiveLevel(perms, "finance", "rendiciones")] < LEVEL_RANK.edit) {
    submodules["finance.rendiciones"] = "edit";
    changed = true;
  }

  // 4. rendicion_submit siempre activo
  if (!capabilities.rendicion_submit) {
    capabilities.rendicion_submit = true;
    changed = true;
  }

  // 5. supervision capabilities siempre activas
  if (!capabilities.supervision_checkin) {
    capabilities.supervision_checkin = true;
    changed = true;
  }
  if (!capabilities.supervision_view_own) {
    capabilities.supervision_view_own = true;
    changed = true;
  }
  if (!capabilities.supervision_dashboard) {
    capabilities.supervision_dashboard = true;
    changed = true;
  }

  // 6. hubLayout siempre "supervisor"
  if (patched.hubLayout !== "supervisor") {
    patched.hubLayout = "supervisor";
    changed = true;
  }

  if (!changed) return perms;

  return {
    ...patched,
    modules,
    submodules,
    capabilities,
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
