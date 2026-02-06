/**
 * App Access - Control de acceso a módulos por rol (Phase 1)
 * 
 * Sistema HARDCODEADO de permisos por módulo.
 * NO usa base de datos (eso es Phase 2).
 * 
 * Reglas:
 * - owner/admin → acceso total
 * - editor → hub, docs, crm, cpq
 * - viewer → hub, docs
 * 
 * Este archivo es el ÚNICO punto de verdad para App Access.
 */

import { type Role } from './rbac';
import { type AppKey } from './app-keys';

/**
 * Matriz de acceso por rol (hardcodeada)
 * 
 * Define qué módulos puede acceder cada rol.
 * Esta es la ÚNICA fuente de verdad para App Access Phase 1.
 */
export const ROLE_APP_ACCESS: Record<Role, AppKey[]> = {
  // Owner y Admin: acceso completo a todos los módulos
  owner: ["hub", "docs", "crm", "cpq", "payroll", "ops", "portal", "admin"],
  admin: ["hub", "docs", "crm", "cpq", "payroll", "ops", "portal", "admin"],

  // Editor: acceso a hub y módulos operativos (sin admin)
  editor: ["hub", "docs", "crm", "cpq", "payroll"],

  // Viewer: solo lectura (hub y docs)
  viewer: ["hub", "docs"],
};

/**
 * Verifica si un rol tiene acceso a un módulo específico
 * 
 * @param role - Rol del usuario (owner, admin, editor, viewer)
 * @param app - Módulo a verificar (hub, docs, crm, cpq, etc)
 * @returns true si tiene acceso, false en caso contrario
 * 
 * @example
 * ```ts
 * hasAppAccess("editor", "crm") // → true
 * hasAppAccess("viewer", "crm") // → false
 * hasAppAccess("admin", "hub")  // → true
 * ```
 */
export function hasAppAccess(role: string, app: AppKey): boolean {
  // Validar que el rol existe en la matriz
  if (!(role in ROLE_APP_ACCESS)) {
    return false;
  }

  const allowedApps = ROLE_APP_ACCESS[role as Role];
  return allowedApps.includes(app);
}

/**
 * Obtiene todos los módulos permitidos para un rol
 * 
 * @param role - Rol del usuario
 * @returns Array de AppKeys permitidas, o array vacío si el rol no existe
 * 
 * @example
 * ```ts
 * getAllowedApps("editor") // → ["hub", "docs", "crm", "cpq"]
 * getAllowedApps("viewer") // → ["hub", "docs"]
 * ```
 */
export function getAllowedApps(role: string): AppKey[] {
  if (!(role in ROLE_APP_ACCESS)) {
    return [];
  }

  return ROLE_APP_ACCESS[role as Role];
}

/**
 * Verifica si un rol tiene acceso a ALGUNO de los módulos especificados
 * 
 * @param role - Rol del usuario
 * @param apps - Array de módulos a verificar
 * @returns true si tiene acceso a al menos uno
 */
export function hasAnyAppAccess(role: string, apps: AppKey[]): boolean {
  return apps.some(app => hasAppAccess(role, app));
}

/**
 * Verifica si un rol tiene acceso a TODOS los módulos especificados
 * 
 * @param role - Rol del usuario
 * @param apps - Array de módulos a verificar
 * @returns true si tiene acceso a todos
 */
export function hasAllAppAccess(role: string, apps: AppKey[]): boolean {
  return apps.every(app => hasAppAccess(role, app));
}
