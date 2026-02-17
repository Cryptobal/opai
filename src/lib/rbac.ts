/**
 * RBAC - Role-Based Access Control
 * Fuente única en role-policy.ts
 */

import {
  PERMISSIONS,
  ROLE_POLICIES,
  ROLES,
  type Permission,
  type Role,
} from "./role-policy";

export { PERMISSIONS, ROLES };
export type { Permission, Role };

const ROLE_HIERARCHY: Record<Role, number> = {
  owner: ROLE_POLICIES.owner.rank,
  admin: ROLE_POLICIES.admin.rank,
  editor: ROLE_POLICIES.editor.rank,
  rrhh: ROLE_POLICIES.rrhh.rank,
  operaciones: ROLE_POLICIES.operaciones.rank,
  finanzas: ROLE_POLICIES.finanzas.rank,
  reclutamiento: ROLE_POLICIES.reclutamiento.rank,
  solo_ops: ROLE_POLICIES.solo_ops.rank,
  solo_crm: ROLE_POLICIES.solo_crm.rank,
  solo_documentos: ROLE_POLICIES.solo_documentos.rank,
  solo_payroll: ROLE_POLICIES.solo_payroll.rank,
  solo_finanzas: ROLE_POLICIES.solo_finanzas.rank,
  supervisor: ROLE_POLICIES.supervisor.rank,
  viewer: ROLE_POLICIES.viewer.rank,
};

/**
 * Verifica si un rol tiene un permiso específico
 */
export function hasPermission(role: Role, permission: Permission): boolean {
  const permissions = ROLE_POLICIES[role].permissions;
  return permissions.includes(permission);
}

/**
 * Verifica si un rol es mayor o igual a otro en la jerarquía
 */
export function hasRoleOrHigher(userRole: Role, requiredRole: Role): boolean {
  return ROLE_HIERARCHY[userRole] >= ROLE_HIERARCHY[requiredRole];
}

/**
 * Verifica si un rol es estrictamente mayor a otro
 */
export function hasHigherRole(userRole: Role, targetRole: Role): boolean {
  return ROLE_HIERARCHY[userRole] > ROLE_HIERARCHY[targetRole];
}

/**
 * Obtiene todos los permisos de un rol
 */
export function getPermissions(role: Role): Permission[] {
  return ROLE_POLICIES[role].permissions;
}

/**
 * Valida si un rol es válido
 */
export function isValidRole(role: string): role is Role {
  return Object.values(ROLES).includes(role as Role);
}

/**
 * Helper para verificar múltiples permisos (AND)
 */
export function hasAllPermissions(role: Role, permissions: Permission[]): boolean {
  return permissions.every(permission => hasPermission(role, permission));
}

/**
 * Helper para verificar múltiples permisos (OR)
 */
export function hasAnyPermission(role: Role, permissions: Permission[]): boolean {
  return permissions.some(permission => hasPermission(role, permission));
}
