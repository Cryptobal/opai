/**
 * Access Control Helpers
 * Helpers locales para control de acceso al Hub
 */

import { ROLES, type Role } from './rbac';

/**
 * Verifica si un rol es admin o superior (owner/admin)
 * @param role - Rol del usuario
 * @returns true si es owner o admin
 */
export function isAdminRole(role: Role | string): boolean {
  return role === ROLES.OWNER || role === ROLES.ADMIN;
}

/**
 * Verifica si un rol es owner
 * @param role - Rol del usuario
 * @returns true si es owner
 */
export function isOwnerRole(role: Role | string): boolean {
  return role === ROLES.OWNER;
}

/**
 * Verifica si un rol tiene acceso al Hub
 * El Hub es exclusivo para owner y admin
 * @param role - Rol del usuario
 * @returns true si tiene acceso
 */
export function hasHubAccess(role: Role | string): boolean {
  return isAdminRole(role);
}
