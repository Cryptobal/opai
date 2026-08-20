/**
 * Permissions Server — Resolución de permisos desde la BD
 *
 * Server-only: usa prisma para queries. No importar en client components.
 */

import { revalidateTag, unstable_cache } from "next/cache";
import { prisma } from "@/lib/prisma";
import { cookies } from "next/headers";
import {
  SIMULATED_ROLE_COOKIE,
  canUserSimulateRoles,
} from "@/lib/role-simulation";
import {
  type RolePermissions,
  getDefaultPermissions,
  EMPTY_PERMISSIONS,
  normalizeRole,
  mergeRolePermissions,
  getEffectiveLevel,
  LEVEL_RANK,
  applyPermissionCompats,
  applySensitiveSalaryRoleLock,
} from "@/lib/permissions";

// ── Role template cache (Next.js Data Cache, TTL 300 s) ──

const CACHE_REVALIDATE = 300;

export function roleTemplateTag(templateId: string): string {
  return `role-template:${templateId}`;
}

interface CachedRoleTemplate {
  permissions: RolePermissions | null;
  slug: string | null;
}

function getCachedRoleTemplate(templateId: string): Promise<CachedRoleTemplate | null> {
  return unstable_cache(
    async () => {
      const template = await prisma.roleTemplate.findUnique({
        where: { id: templateId },
        select: { permissions: true, slug: true },
      });
      if (!template) return null;
      return {
        permissions: template.permissions as unknown as RolePermissions | null,
        slug: template.slug,
      };
    },
    ["role-template", templateId],
    { revalidate: CACHE_REVALIDATE, tags: [roleTemplateTag(templateId)] },
  )();
}

/** Invalidar cache de un template (cuando se edita) */
export function invalidateTemplateCache(templateId: string): void {
  revalidateTag(roleTemplateTag(templateId), "max");
}

/** Invalidar todo el cache de templates (cuando se hace cambio masivo) */
export function invalidateAllCache(): void {
  // Sin listado global de tags: las mutaciones deben invalidar por id.
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
    const template = await getCachedRoleTemplate(user.roleTemplateId);

    if (template?.permissions) {
      if (template.slug) effectiveRole = normalizeRole(template.slug);
      const merged = mergeRolePermissions(defaultPerms, template.permissions);
      return applySensitiveSalaryRoleLock(
        effectiveRole,
        applyPermissionCompats(ensureSupervisorSupervisionAccess(effectiveRole, merged)),
      );
    }
  }

  // Fallback a defaults por rol legacy
  return applySensitiveSalaryRoleLock(
    effectiveRole,
    applyPermissionCompats(ensureSupervisorSupervisionAccess(effectiveRole, defaultPerms)),
  );
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

  // 3a. CRM: solo cuentas, instalaciones, contactos (sin leads, negocios, cotizaciones)
  if (LEVEL_RANK[getEffectiveLevel(patched, "crm", "leads")] > LEVEL_RANK.none) {
    submodules["crm.leads"] = "none";
    changed = true;
  }
  if (LEVEL_RANK[getEffectiveLevel(patched, "crm", "deals")] > LEVEL_RANK.none) {
    submodules["crm.deals"] = "none";
    changed = true;
  }
  if (LEVEL_RANK[getEffectiveLevel(patched, "crm", "quotes")] > LEVEL_RANK.none) {
    submodules["crm.quotes"] = "none";
    changed = true;
  }

  // 3b. ops.tickets al menos "edit" (enviar tickets)
  if (LEVEL_RANK[getEffectiveLevel(patched, "ops", "tickets")] < LEVEL_RANK.edit) {
    submodules["ops.tickets"] = "edit";
    changed = true;
  }

  // 3c. ops.rondas al menos "edit" (gestionar rondas)
  if (LEVEL_RANK[getEffectiveLevel(patched, "ops", "rondas")] < LEVEL_RANK.edit) {
    submodules["ops.rondas"] = "edit";
    changed = true;
  }

  // 4. finance.rendiciones al menos "edit" (crear rendiciones)
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

  // 5b. rondas_configure siempre activa para supervisores
  if (!capabilities.rondas_configure) {
    capabilities.rondas_configure = true;
    changed = true;
  }

  // 5c. rondas_resolve_alerts siempre activa para supervisores
  if (!capabilities.rondas_resolve_alerts) {
    capabilities.rondas_resolve_alerts = true;
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

import { canView, canEdit, canDelete, hasModuleAccess, hasCapability, hasFacturacionCapability, canViewInstallations, canEditInstallations, canDeleteInstallations } from "./permissions";
import type { ModuleKey, CapabilityKey, FacturacionCapability } from "./permissions";

export { canView, canEdit, canDelete, hasModuleAccess, hasCapability, hasFacturacionCapability, canViewInstallations, canEditInstallations, canDeleteInstallations };
export type { ModuleKey, CapabilityKey, FacturacionCapability };

interface SessionUser {
  role: string;
  roleTemplateId?: string | null;
  tenantId?: string;
  [key: string]: unknown;
}

/**
 * Resuelve permisos desde un slug de rol (simulación de owner/admin en el Hub).
 * Usa template de BD del tenant si existe; si no, defaults del sistema.
 */
export async function resolvePermissionsByRoleSlug(
  slug: string,
  tenantId: string,
): Promise<RolePermissions> {
  const normalizedSlug = normalizeRole(slug);
  const defaultPerms = getDefaultPermissions(normalizedSlug);

  const template = await prisma.roleTemplate.findFirst({
    where: { tenantId, slug: normalizedSlug },
    select: { permissions: true, slug: true },
  });

  if (template?.permissions) {
    const merged = mergeRolePermissions(
      defaultPerms,
      template.permissions as unknown as RolePermissions,
    );
    return applySensitiveSalaryRoleLock(
      normalizedSlug,
      applyPermissionCompats(ensureSupervisorSupervisionAccess(normalizedSlug, merged)),
    );
  }

  return applySensitiveSalaryRoleLock(
    normalizedSlug,
    applyPermissionCompats(ensureSupervisorSupervisionAccess(normalizedSlug, defaultPerms)),
  );
}

/**
 * Resuelve permisos para páginas del Hub respetando simulación de rol (cookie).
 * Solo owner/admin pueden simular.
 */
export async function resolveHubPagePerms(user: SessionUser): Promise<RolePermissions> {
  const realRole = normalizeRole(user.role);
  const realPerms = await resolvePagePerms(user);

  if (!canUserSimulateRoles(realRole)) {
    return realPerms;
  }

  const simulatedSlug = (await cookies()).get(SIMULATED_ROLE_COOKIE)?.value;
  if (!simulatedSlug) {
    return realPerms;
  }

  const normalized = normalizeRole(decodeURIComponent(simulatedSlug));
  if (normalized === realRole) {
    return realPerms;
  }

  const tenantId = user.tenantId;
  if (!tenantId) {
    return realPerms;
  }

  return resolvePermissionsByRoleSlug(normalized, tenantId);
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
