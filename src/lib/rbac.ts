/**
 * RBAC - Role-Based Access Control
 * Sistema de permisos para Gard Docs
 */

// Roles disponibles (en orden de jerarquía)
export const ROLES = {
  OWNER: 'owner',
  ADMIN: 'admin',
  EDITOR: 'editor',
  VIEWER: 'viewer',
} as const;

export type Role = typeof ROLES[keyof typeof ROLES];

// Jerarquía de roles (owner > admin > editor > viewer)
const ROLE_HIERARCHY: Record<Role, number> = {
  owner: 4,
  admin: 3,
  editor: 2,
  viewer: 1,
};

// Permisos por funcionalidad
export const PERMISSIONS = {
  // Usuarios
  MANAGE_USERS: 'manage_users',
  INVITE_USERS: 'invite_users',
  
  // Templates
  MANAGE_TEMPLATES: 'manage_templates',
  EDIT_TEMPLATES: 'edit_templates',
  VIEW_TEMPLATES: 'view_templates',
  
  // Presentaciones
  SEND_PRESENTATIONS: 'send_presentations',
  CREATE_PRESENTATIONS: 'create_presentations',
  VIEW_PRESENTATIONS: 'view_presentations',
  
  // Analytics
  VIEW_ANALYTICS: 'view_analytics',
  
  // Configuración
  MANAGE_SETTINGS: 'manage_settings',
} as const;

export type Permission = typeof PERMISSIONS[keyof typeof PERMISSIONS];

// Matriz de permisos por rol
const ROLE_PERMISSIONS: Record<Role, Permission[]> = {
  owner: [
    PERMISSIONS.MANAGE_USERS,
    PERMISSIONS.INVITE_USERS,
    PERMISSIONS.MANAGE_TEMPLATES,
    PERMISSIONS.EDIT_TEMPLATES,
    PERMISSIONS.VIEW_TEMPLATES,
    PERMISSIONS.SEND_PRESENTATIONS,
    PERMISSIONS.CREATE_PRESENTATIONS,
    PERMISSIONS.VIEW_PRESENTATIONS,
    PERMISSIONS.VIEW_ANALYTICS,
    PERMISSIONS.MANAGE_SETTINGS,
  ],
  admin: [
    PERMISSIONS.MANAGE_USERS,
    PERMISSIONS.INVITE_USERS,
    PERMISSIONS.MANAGE_TEMPLATES,
    PERMISSIONS.EDIT_TEMPLATES,
    PERMISSIONS.VIEW_TEMPLATES,
    PERMISSIONS.SEND_PRESENTATIONS,
    PERMISSIONS.CREATE_PRESENTATIONS,
    PERMISSIONS.VIEW_PRESENTATIONS,
    PERMISSIONS.VIEW_ANALYTICS,
  ],
  editor: [
    PERMISSIONS.EDIT_TEMPLATES,
    PERMISSIONS.VIEW_TEMPLATES,
    PERMISSIONS.SEND_PRESENTATIONS,
    PERMISSIONS.CREATE_PRESENTATIONS,
    PERMISSIONS.VIEW_PRESENTATIONS,
  ],
  viewer: [
    PERMISSIONS.VIEW_TEMPLATES,
    PERMISSIONS.VIEW_PRESENTATIONS,
  ],
};

/**
 * Verifica si un rol tiene un permiso específico
 */
export function hasPermission(role: Role, permission: Permission): boolean {
  const permissions = ROLE_PERMISSIONS[role];
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
  return ROLE_PERMISSIONS[role];
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
