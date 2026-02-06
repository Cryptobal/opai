/**
 * App Keys - Identificadores de módulos OPAI Suite
 * 
 * Define los módulos/aplicaciones disponibles en OPAI Suite.
 * Usado para control de acceso por rol (App Access Phase 1).
 */

/**
 * Identificadores de aplicaciones en OPAI Suite
 */
export type AppKey =
  | "hub"       // Centro de control ejecutivo
  | "docs"      // Presentaciones comerciales (Docs/Proposals)
  | "crm"       // Customer Relationship Management
  | "cpq"       // Configure, Price, Quote
  | "payroll"   // Sistema de liquidaciones Chile
  | "ops"       // Operaciones (futuro)
  | "portal"    // Portal de clientes (futuro)
  | "admin";    // Gestión de usuarios y configuración

/**
 * Lista de todas las apps disponibles
 */
export const ALL_APPS: AppKey[] = [
  "hub",
  "docs",
  "crm",
  "cpq",
  "payroll",
  "ops",
  "portal",
  "admin",
];

/**
 * Metadata de aplicaciones (opcional, para UI)
 */
export const APP_METADATA: Record<AppKey, { name: string; description: string }> = {
  hub: {
    name: "Hub",
    description: "Centro de control ejecutivo",
  },
  docs: {
    name: "Docs",
    description: "Presentaciones comerciales",
  },
  crm: {
    name: "CRM",
    description: "Gestión de clientes",
  },
  cpq: {
    name: "CPQ",
    description: "Configurador de precios",
  },
  payroll: {
    name: "Payroll",
    description: "Liquidaciones y costeo Chile",
  },
  ops: {
    name: "Ops",
    description: "Gestión de operaciones",
  },
  portal: {
    name: "Portal",
    description: "Portal de clientes",
  },
  admin: {
    name: "Admin",
    description: "Usuarios y configuración",
  },
};
