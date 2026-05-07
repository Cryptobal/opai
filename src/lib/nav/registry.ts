/**
 * Navigation Registry — Source of truth única para toda la navegación de la app.
 *
 * 4 niveles de jerarquía:
 * - N1 (módulos): CRM, Operaciones, Personas, Payroll, Finanzas, Documentos, Config…
 * - N2 (sub-módulos): leads, accounts, rendiciones, facturación, reportes…
 * - N3 (sub-secciones): notas crédito/débito, recurrentes, cesiones, EERR, balance…
 * - N4 (drill-down detalle): ficha individual con tabs (manejado por EntityDetailLayout)
 *
 * Este archivo reemplaza la triplicación previa entre:
 *   - role-nav-builder.ts (sidebar desktop)
 *   - module-nav.ts (bottom nav mobile)
 *   - 12 archivos *Subnav.tsx
 *
 * Los archivos arriba ahora son thin wrappers que consumen este registry.
 *
 * Patrón de visibilidad por nodo (todos opcionales, AND):
 *   - module:    requiere hasModuleAccess(perms, module)
 *   - submodule: requiere canView(perms, module, submodule)
 *   - capability: requiere hasCapability(perms, capability)
 *   - tenantModule: requiere isModuleEnabled(tenantModule)
 *   - adminOnly: requiere isAdmin
 *   - show:      predicado custom (perms) => boolean
 */

import type { LucideIcon } from "lucide-react";
import {
  // Hub / chat
  Grid3x3,
  // CRM
  Users,
  Building2,
  TrendingUp,
  Contact,
  DollarSign,
  Sparkles,
  MapPin,
  // Ops
  Activity,
  CalendarDays,
  ClipboardCheck,
  Ticket,
  Route,
  Siren,
  Briefcase,
  Package,
  Shield,
  ShieldAlert,
  ClipboardList,
  Fingerprint,
  UserRoundCheck,
  Clock3,
  Radio,
  Bell,
  Brain,
  Settings,
  Shirt,
  Warehouse,
  ShoppingCart,
  Layers,
  Smartphone,
  Phone,
  Settings2,
  // Personas
  User,
  GraduationCap,
  Trophy,
  // Payroll
  Wallet,
  Calculator,
  FileText,
  // Finanzas
  Landmark,
  Receipt,
  CheckCircle2,
  BookText,
  BarChart3,
  FileBarChart,
  Scale,
  FileInput,
  // Documentos
  FolderOpen,
  LayoutTemplate,
  // TE
  Banknote,
  // Configuración
  Plug,
  PenLine,
  FolderTree,
  Mail,
  KeyRound,
  // Portales
  Monitor,
  ScanLine,
} from "lucide-react";

import {
  type RolePermissions,
  type CapabilityKey,
  type ModuleKey,
  hasModuleAccess,
  canView,
  canViewInstallations,
  hasCapability,
} from "@/lib/permissions";

/* ────────────────────────────────────────────────────────────
 * Types
 * ──────────────────────────────────────────────────────────── */

export interface NavVisibility {
  /** Module-level access required (e.g. "crm", "ops") */
  module?: ModuleKey;
  /** Submodule-level access required (used together with module) */
  submodule?: string;
  /** Specific capability required */
  capability?: CapabilityKey;
  /** Tenant must have this module enabled (e.g. "ops_rondas", "ats") */
  tenantModule?: string;
  /** Admin only */
  adminOnly?: boolean;
  /** Custom predicate (combined with the above with AND) */
  show?: (perms: RolePermissions) => boolean;
}

export interface NavBadge {
  /** Key in `notesByModule` map (e.g. "lead", "ticket") */
  notesKey?: string;
}

export interface NavNode extends NavVisibility {
  /** Stable unique key (used for ordering, persistence) */
  key: string;
  /** URL */
  href: string;
  /** Display label */
  label: string;
  /** Icon component */
  icon: LucideIcon;
  /** Children (next nav level) */
  children?: NavNode[];
  /** When true, only matches when pathname === href exactly (used for "Inicio"/"Dashboard"-like items) */
  exactMatch?: boolean;
  /** Badge configuration */
  badge?: NavBadge;
  /** Short label for the bottom nav (mobile) when the regular label is too long.
   *  If absent, `label` is used. */
  shortLabel?: string;
  /** When true, this node is shown in the sidebar but not in the bottom nav contextual menu.
   *  Useful for "Inicio" of a module that already shows when you tap the module from the main nav. */
  hideInBottomNav?: boolean;
  /** When true, this node is rendered in the bottom nav but does NOT appear as a row in the
   *  N3 SubNav arriba del contenido. Útil cuando una vista no tiene página propia (ej. accesos rápidos). */
  hideInSubNav?: boolean;
  /** When set, groups this node under a category in the sub-sidebar (used by ConfigShell
   *  to organize many sub-pages — Slack/Notion settings pattern). */
  category?: string;
}

/** Order + label for sub-sidebar categories. */
export interface NavCategory {
  key: string;
  label: string;
}

/* ────────────────────────────────────────────────────────────
 * Visibility helper
 * ──────────────────────────────────────────────────────────── */

export interface VisibilityContext {
  perms: RolePermissions;
  isAdmin: boolean;
  isModuleEnabled: (mod: string) => boolean;
}

export function isNodeVisible(node: NavVisibility, ctx: VisibilityContext): boolean {
  if (node.module && !hasModuleAccess(ctx.perms, node.module)) return false;
  if (node.module && node.submodule) {
    // Special case: crm.installations is checked via canViewInstallations
    if (node.module === "crm" && node.submodule === "installations") {
      if (!canViewInstallations(ctx.perms)) return false;
    } else if (!canView(ctx.perms, node.module, node.submodule)) {
      return false;
    }
  }
  if (node.capability && !hasCapability(ctx.perms, node.capability)) return false;
  if (node.tenantModule && !ctx.isModuleEnabled(node.tenantModule)) return false;
  if (node.adminOnly && !ctx.isAdmin) return false;
  if (node.show && !node.show(ctx.perms)) return false;
  return true;
}

/** Filter children of a node by visibility rules */
export function filterChildren(node: NavNode, ctx: VisibilityContext): NavNode[] {
  return (node.children ?? []).filter((c) => isNodeVisible(c, ctx));
}

/* ────────────────────────────────────────────────────────────
 * REGISTRY — the only source of truth
 * ──────────────────────────────────────────────────────────── */

/** Categorías ordenadas para el sub-sidebar de Configuración. */
export const CONFIG_CATEGORIES: NavCategory[] = [
  { key: "general", label: "General" },
  { key: "permisos", label: "Permisos" },
  { key: "comunicacion", label: "Comunicación" },
  { key: "plantillas", label: "Plantillas" },
  { key: "modulos", label: "Módulos" },
  { key: "ia", label: "Inteligencia Artificial" },
];

export const NAV_MODULES: NavNode[] = [
  // ═════════════════════════════════════════════════════════
  // HUB
  // ═════════════════════════════════════════════════════════
  {
    key: "hub",
    href: "/hub",
    label: "Inicio",
    icon: Grid3x3,
    module: "hub",
  },

  // ═════════════════════════════════════════════════════════
  // CRM (Comercial)
  // ═════════════════════════════════════════════════════════
  {
    key: "crm",
    href: "/crm",
    label: "Comercial",
    icon: TrendingUp,
    module: "crm",
    tenantModule: "crm",
    children: [
      { key: "crm-leads", href: "/crm/leads", label: "Leads", icon: Users, module: "crm", submodule: "leads", badge: { notesKey: "lead" } },
      { key: "crm-accounts", href: "/crm/accounts", label: "Cuentas", icon: Building2, module: "crm", submodule: "accounts", badge: { notesKey: "account" } },
      { key: "crm-deals", href: "/crm/deals", label: "Negocios", icon: TrendingUp, module: "crm", submodule: "deals", badge: { notesKey: "deal" } },
      { key: "crm-contacts", href: "/crm/contacts", label: "Contactos", icon: Contact, module: "crm", submodule: "contacts", badge: { notesKey: "contact" } },
      { key: "crm-quotes", href: "/crm/cotizaciones", label: "Cotizaciones", icon: DollarSign, module: "crm", submodule: "quotes", tenantModule: "cpq", badge: { notesKey: "quotation" } },
      { key: "crm-prospecting", href: "/crm/prospecting", label: "Prospección", icon: Sparkles, module: "crm", submodule: "leads" },
      { key: "crm-installations", href: "/crm/installations", label: "Instalaciones", icon: MapPin, module: "crm", submodule: "installations", badge: { notesKey: "installation" } },
    ],
  },

  // ═════════════════════════════════════════════════════════
  // OPERACIONES
  // ═════════════════════════════════════════════════════════
  {
    key: "ops",
    href: "/ops",
    label: "Operaciones",
    icon: Activity,
    module: "ops",
    children: [
      // Pautas (sub-módulo con N3)
      {
        key: "ops-pautas",
        href: "/ops/pauta-mensual",
        label: "Pautas",
        icon: CalendarDays,
        module: "ops",
        // Visible si tiene CUALQUIERA de las sub-secciones
        show: (perms) =>
          canView(perms, "ops", "pauta_mensual") ||
          canView(perms, "ops", "pauta_diaria") ||
          canView(perms, "ops", "turnos_extra") ||
          canView(perms, "ops", "ppc"),
        badge: { notesKey: "marcacion" },
        children: [
          { key: "pautas-mensual", href: "/ops/pauta-mensual", label: "Mensual", icon: CalendarDays, module: "ops", submodule: "pauta_mensual" },
          { key: "pautas-diaria", href: "/ops/pauta-diaria", label: "Diaria", icon: UserRoundCheck, module: "ops", submodule: "pauta_diaria" },
          { key: "pautas-te", href: "/ops/turnos-extra", label: "Turnos Extra", icon: Clock3, module: "ops", submodule: "turnos_extra" },
          { key: "pautas-ppc", href: "/ops/ppc", label: "PPC", icon: ShieldAlert, module: "ops", submodule: "ppc" },
          { key: "pautas-refuerzos", href: "/ops/refuerzos", label: "Refuerzos", icon: Shield, module: "ops", submodule: "turnos_extra" },
          { key: "pautas-marcaciones", href: "/ops/marcaciones", label: "Marcaciones", icon: Fingerprint, module: "ops", submodule: "marcaciones" },
          { key: "pautas-auditoria", href: "/ops/audit-pautas", label: "Auditoría", icon: ClipboardList, module: "ops", submodule: "pauta_mensual" },
        ],
      },
      // Instalaciones — vive bajo /crm/installations pero se navega desde Ops también
      {
        key: "ops-installations",
        href: "/crm/installations",
        label: "Instalaciones",
        icon: MapPin,
        show: canViewInstallations,
        badge: { notesKey: "installation" },
      },
      // Supervisión (sub-módulo con N3)
      {
        key: "ops-supervision",
        href: "/ops/supervision",
        label: "Supervisión",
        icon: ClipboardCheck,
        module: "ops",
        submodule: "supervision",
        tenantModule: "ops_supervision",
        badge: { notesKey: "supervision_visit" },
        children: [
          { key: "sup-grilla", href: "/ops/supervision", label: "Grilla", icon: Grid3x3, module: "ops", submodule: "supervision", exactMatch: true },
          { key: "sup-hallazgos", href: "/ops/supervision/hallazgos", label: "Hallazgos", icon: ShieldAlert, module: "ops", submodule: "supervision" },
          { key: "sup-dashboard", href: "/ops/supervision/dashboard", label: "Dashboard", icon: BarChart3, module: "ops", submodule: "supervision" },
          { key: "sup-historial", href: "/ops/supervision/historial", label: "Historial", icon: ClipboardList, module: "ops", submodule: "supervision" },
          { key: "sup-asignaciones", href: "/ops/supervision/asignaciones", label: "Asignaciones", icon: Users, module: "ops", submodule: "supervision" },
        ],
      },
      // Tickets
      {
        key: "ops-tickets",
        href: "/ops/tickets",
        label: "Tickets",
        icon: Ticket,
        module: "ops",
        submodule: "tickets",
        badge: { notesKey: "ticket" },
      },
      // Rondas (sub-módulo con N3)
      {
        key: "ops-rondas",
        href: "/ops/rondas",
        label: "Rondas",
        icon: Route,
        module: "ops",
        submodule: "rondas",
        tenantModule: "ops_rondas",
        children: [
          { key: "rondas-dashboard", href: "/ops/rondas", label: "Dashboard", icon: ClipboardList, exactMatch: true, module: "ops", submodule: "rondas" },
          { key: "rondas-monitoreo", href: "/ops/rondas/monitoreo", label: "Monitor", icon: Radio, module: "ops", submodule: "rondas" },
          { key: "rondas-alertas", href: "/ops/rondas/alertas", label: "Alertas", icon: Bell, module: "ops", submodule: "rondas" },
          { key: "rondas-reportes", href: "/ops/rondas/reportes", label: "Reportes", icon: BarChart3, module: "ops", submodule: "rondas" },
          { key: "rondas-centro-ia", href: "/ops/rondas/centro-ia", label: "Centro IA", icon: Brain, module: "ops", submodule: "rondas" },
          { key: "rondas-config", href: "/ops/rondas/configuracion", label: "Configuración", icon: Settings, module: "ops", submodule: "rondas" },
        ],
      },
      // Alertas Cobertura
      {
        key: "ops-alertas-cobertura",
        href: "/ops/alertas-cobertura",
        label: "Alertas Cobertura",
        icon: Siren,
        shortLabel: "Alertas",
        module: "ops",
        submodule: "alertas_cobertura",
        tenantModule: "alertas_cobertura",
      },
      // ATS
      {
        key: "ops-ats",
        href: "/ops/ats",
        label: "ATS — Reclutamiento",
        shortLabel: "ATS",
        icon: Briefcase,
        module: "ops",
        submodule: "ats",
        tenantModule: "ats",
      },
      // Inventario (sub-módulo con N3)
      {
        key: "ops-inventario",
        href: "/ops/inventario",
        label: "Inventario",
        icon: Package,
        module: "ops",
        submodule: "inventario",
        tenantModule: "ops_inventario",
        children: [
          { key: "inv-inicio", href: "/ops/inventario", label: "Inicio", icon: Package, exactMatch: true, module: "ops", submodule: "inventario" },
          { key: "inv-productos", href: "/ops/inventario/productos", label: "Productos", icon: Shirt, module: "ops", submodule: "inventario" },
          { key: "inv-bodegas", href: "/ops/inventario/bodegas", label: "Bodegas", icon: Warehouse, module: "ops", submodule: "inventario" },
          { key: "inv-compras", href: "/ops/inventario/compras", label: "Compras", icon: ShoppingCart, module: "ops", submodule: "inventario" },
          { key: "inv-entregas", href: "/ops/inventario/entregas", label: "Entregas", icon: UserRoundCheck, module: "ops", submodule: "inventario" },
          { key: "inv-stock", href: "/ops/inventario/stock", label: "Stock", icon: Layers, module: "ops", submodule: "inventario" },
          { key: "inv-activos", href: "/ops/inventario/activos", label: "Activos", icon: Smartphone, module: "ops", submodule: "inventario" },
          { key: "inv-lineas", href: "/ops/inventario/lineas", label: "Líneas", icon: Phone, module: "ops", submodule: "inventario" },
          { key: "inv-config", href: "/ops/inventario/configuracion", label: "Configuración", icon: Settings2, module: "ops", submodule: "inventario", hideInBottomNav: true },
        ],
      },
    ],
  },

  // ═════════════════════════════════════════════════════════
  // PERSONAS
  // ═════════════════════════════════════════════════════════
  {
    key: "personas",
    href: "/personas/guardias",
    label: "Personas",
    icon: User,
    // Personas comparte el módulo "ops" en el modelo de permisos
    show: (perms) => hasModuleAccess(perms, "ops"),
    children: [
      { key: "personas-listado", href: "/personas/guardias", label: "Listado", icon: User, badge: { notesKey: "guard" }, exactMatch: true },
      { key: "personas-conocimiento", href: "/personas/conocimiento", label: "Conocimiento", icon: GraduationCap, badge: { notesKey: "knowledge_alert" } },
      { key: "personas-onboarding", href: "/personas/onboarding", label: "Onboarding", icon: UserRoundCheck, tenantModule: "ops_onboarding" },
      { key: "personas-comunicaciones", href: "/personas/comunicaciones", label: "Comunicaciones", icon: Bell },
      { key: "personas-sueldos-rut", href: "/personas/guardias/sueldos-rut", label: "Sueldos por RUT", shortLabel: "Sueldos RUT", icon: DollarSign },
      { key: "personas-gamificacion", href: "/personas/gamificacion", label: "Gamificación", icon: Trophy, module: "ops", submodule: "gamificacion", tenantModule: "gamificacion" },
      { key: "personas-psicolaboral", href: "/personas/psicolaboral", label: "Psicolaboral", icon: Brain, tenantModule: "psych" },
    ],
  },

  // ═════════════════════════════════════════════════════════
  // PAYROLL
  // ═════════════════════════════════════════════════════════
  {
    key: "payroll",
    href: "/payroll",
    label: "Payroll",
    icon: Wallet,
    module: "payroll",
    tenantModule: "payroll",
    children: [
      { key: "payroll-periodos", href: "/payroll/periodos", label: "Períodos de Pago", shortLabel: "Períodos", icon: CalendarDays, badge: { notesKey: "payroll_record" } },
      { key: "payroll-asistencia", href: "/payroll/asistencia", label: "Cierre Asistencia", shortLabel: "Asistencia", icon: ClipboardCheck },
      { key: "payroll-anticipos", href: "/payroll/anticipos", label: "Anticipos", icon: Wallet },
      { key: "payroll-simulator", href: "/payroll/simulator", label: "Simulador", icon: Calculator },
      { key: "payroll-parameters", href: "/payroll/parameters", label: "Parámetros", icon: FileText },
    ],
  },

  // ═════════════════════════════════════════════════════════
  // FINANZAS
  // ═════════════════════════════════════════════════════════
  {
    key: "finance",
    href: "/finanzas",
    label: "Finanzas",
    icon: Landmark,
    module: "finance",
    tenantModule: "finanzas",
    children: [
      // Inicio (dashboard tarjetas)
      {
        key: "finance-inicio",
        href: "/finanzas",
        label: "Inicio",
        icon: Grid3x3,
        exactMatch: true,
        show: (perms) =>
          canView(perms, "finance", "reportes") || hasCapability(perms, "rendicion_view_all"),
      },
      // Rendiciones
      {
        key: "finance-rendiciones",
        href: "/finanzas/rendiciones",
        label: "Rendiciones",
        shortLabel: "Rendic.",
        icon: Receipt,
        module: "finance",
        submodule: "rendiciones",
        badge: { notesKey: "rendicion" },
      },
      // Aprobaciones
      {
        key: "finance-aprobaciones",
        href: "/finanzas/aprobaciones",
        label: "Aprobaciones",
        icon: CheckCircle2,
        capability: "rendicion_approve",
      },
      // Pagos
      {
        key: "finance-pagos",
        href: "/finanzas/pagos",
        label: "Pagos",
        icon: Wallet,
        capability: "rendicion_pay",
      },
      // Ventas (Facturación) — con N3
      {
        key: "finance-ventas",
        href: "/finanzas/facturacion",
        label: "Ventas",
        icon: FileText,
        module: "finance",
        submodule: "facturacion",
        children: [
          { key: "ventas-resumen", href: "/finanzas/facturacion", label: "Resumen", icon: Grid3x3, exactMatch: true, module: "finance", submodule: "facturacion" },
          { key: "ventas-emitir", href: "/finanzas/facturacion/emitir", label: "Emitir DTE", icon: FileText, module: "finance", submodule: "facturacion" },
          { key: "ventas-recurrentes", href: "/finanzas/facturacion/recurrentes", label: "Recurrentes", icon: CalendarDays, module: "finance", submodule: "facturacion" },
          { key: "ventas-nc", href: "/finanzas/facturacion/notas/credito", label: "Notas Crédito", icon: FileText, module: "finance", submodule: "facturacion" },
          { key: "ventas-nd", href: "/finanzas/facturacion/notas/debito", label: "Notas Débito", icon: FileText, module: "finance", submodule: "facturacion" },
          { key: "ventas-cesiones", href: "/finanzas/facturacion/cesiones", label: "Cesiones", icon: DollarSign, module: "finance", submodule: "facturacion" },
        ],
      },
      // Compras
      {
        key: "finance-compras",
        href: "/finanzas/proveedores",
        label: "Compras",
        icon: FileInput,
        module: "finance",
        submodule: "proveedores",
      },
      // Banca
      {
        key: "finance-banca",
        href: "/finanzas/bancos",
        label: "Banca",
        icon: Landmark,
        module: "finance",
        submodule: "contabilidad",
      },
      // Contabilidad
      {
        key: "finance-contabilidad",
        href: "/finanzas/contabilidad",
        label: "Contabilidad",
        shortLabel: "Contab.",
        icon: BookText,
        module: "finance",
        submodule: "contabilidad",
      },
      // Informes (Reportes) — con N3
      {
        key: "finance-informes",
        href: "/finanzas/reportes",
        label: "Informes",
        icon: BarChart3,
        module: "finance",
        submodule: "reportes",
        children: [
          { key: "rep-dashboard", href: "/finanzas/reportes", label: "Dashboard", icon: Grid3x3, exactMatch: true, module: "finance", submodule: "reportes" },
          { key: "rep-eerr", href: "/finanzas/reportes/eerr", label: "Estado de Resultado", shortLabel: "EERR", icon: FileBarChart, module: "finance", submodule: "reportes" },
          { key: "rep-balance", href: "/finanzas/reportes/balance", label: "Balance General", shortLabel: "Balance", icon: Scale, module: "finance", submodule: "reportes" },
          { key: "rep-ventas", href: "/finanzas/reportes/ventas", label: "Ventas por cliente", shortLabel: "Ventas", icon: TrendingUp, module: "finance", submodule: "reportes" },
          { key: "rep-compras", href: "/finanzas/reportes/compras", label: "Compras", icon: Receipt, module: "finance", submodule: "reportes" },
          { key: "rep-rentabilidad", href: "/finanzas/reportes/rentabilidad", label: "Rentabilidad", icon: TrendingUp, module: "finance", submodule: "reportes" },
          { key: "rep-mayor", href: "/finanzas/reportes/mayor", label: "Libro Mayor", shortLabel: "Mayor", icon: BookText, module: "finance", submodule: "reportes" },
        ],
      },
    ],
  },

  // ═════════════════════════════════════════════════════════
  // DOCUMENTOS
  // ═════════════════════════════════════════════════════════
  {
    key: "docs",
    href: "/opai/documentos",
    label: "Documentos",
    icon: FolderOpen,
    module: "docs",
    tenantModule: "documentos",
    children: [
      { key: "docs-gestion", href: "/opai/documentos", label: "Gestión", icon: FolderOpen, module: "docs", submodule: "gestion", badge: { notesKey: "document" }, exactMatch: true },
      { key: "docs-operativos", href: "/opai/documentos-operativos", label: "Operativos", icon: ClipboardCheck, module: "docs", submodule: "operativos" },
      { key: "docs-templates", href: "/opai/documentos/templates", label: "Templates", icon: LayoutTemplate, module: "docs", submodule: "plantillas" },
    ],
  },

  // ═════════════════════════════════════════════════════════
  // TURNOS EXTRA (TE) — módulo aparte
  // ═════════════════════════════════════════════════════════
  {
    key: "te",
    href: "/te/registro",
    label: "Turnos Extra",
    icon: Clock3,
    children: [
      { key: "te-registro", href: "/te/registro", label: "Registro", icon: ClipboardList },
      { key: "te-aprobaciones", href: "/te/aprobaciones", label: "Aprobaciones", icon: CheckCircle2 },
      { key: "te-lotes", href: "/te/lotes", label: "Lotes", icon: Layers },
      { key: "te-pagos", href: "/te/pagos", label: "Pagos", icon: Banknote },
    ],
  },

  // ═════════════════════════════════════════════════════════
  // REPORTES DT (Dirección del Trabajo)
  // ═════════════════════════════════════════════════════════
  {
    key: "reportes_dt",
    href: "/reportes/dt",
    label: "Reportes DT",
    icon: FileBarChart,
    module: "reportes_dt",
    tenantModule: "reportes_dt",
    children: [
      { key: "dt-asistencia", href: "/reportes/dt/asistencia-diaria", label: "Asistencia Diaria", shortLabel: "Asistencia", icon: FileBarChart },
      { key: "dt-jornada", href: "/reportes/dt/jornada-diaria", label: "Jornada Diaria", shortLabel: "Jornada", icon: FileBarChart },
      { key: "dt-festivos", href: "/reportes/dt/domingos-festivos", label: "Domingos y Festivos", shortLabel: "Festivos", icon: FileBarChart },
      { key: "dt-modificaciones", href: "/reportes/dt/modificaciones-turnos", label: "Modificaciones", shortLabel: "Modific.", icon: FileBarChart },
    ],
  },

  // ═════════════════════════════════════════════════════════
  // CONFIGURACIÓN — agrupada en categorías para el sub-sidebar
  // ═════════════════════════════════════════════════════════
  {
    key: "config",
    href: "/opai/configuracion",
    label: "Configuración",
    icon: Settings,
    module: "config",
    children: [
      // ── General ──
      { key: "config-empresa", href: "/opai/configuracion/empresa", label: "Empresa", icon: Building2, module: "config", submodule: "empresa", category: "general" },
      { key: "config-mi-plan", href: "/opai/configuracion/mi-plan", label: "Mi Plan", icon: Sparkles, module: "config", submodule: "mi_plan", category: "general" },
      { key: "config-cumplimiento", href: "/opai/configuracion/cumplimiento", label: "Cumplimiento", icon: Shield, module: "config", submodule: "cumplimiento", category: "general" },
      { key: "config-auditoria", href: "/opai/configuracion/auditoria", label: "Auditoría", icon: FileBarChart, module: "config", submodule: "auditoria", category: "general" },
      // ── Permisos ──
      { key: "config-usuarios", href: "/opai/configuracion/usuarios", label: "Usuarios", icon: Users, module: "config", submodule: "usuarios", category: "permisos" },
      { key: "config-roles", href: "/opai/configuracion/roles", label: "Roles y Permisos", shortLabel: "Roles", icon: KeyRound, module: "config", submodule: "roles", category: "permisos" },
      { key: "config-grupos", href: "/opai/configuracion/grupos", label: "Grupos", icon: Users, module: "config", submodule: "grupos", category: "permisos" },
      // ── Comunicación ──
      { key: "config-integraciones", href: "/opai/configuracion/integraciones", label: "Integraciones", icon: Plug, module: "config", submodule: "integraciones", category: "comunicacion" },
      { key: "config-notificaciones", href: "/opai/configuracion/notificaciones", label: "Notificaciones", shortLabel: "Notif.", icon: Bell, module: "config", submodule: "notificaciones", category: "comunicacion" },
      { key: "config-firmas", href: "/opai/configuracion/firmas", label: "Firmas", icon: PenLine, module: "config", submodule: "firmas", category: "comunicacion" },
      { key: "config-email-templates", href: "/opai/configuracion/email-templates", label: "Plantillas Email", shortLabel: "Emails", icon: Mail, category: "comunicacion" },
      // ── Plantillas ──
      { key: "config-categorias", href: "/opai/configuracion/categorias-plantillas", label: "Categorías Plantillas", shortLabel: "Categorías", icon: FolderTree, module: "config", submodule: "categorias", category: "plantillas" },
      { key: "config-documentos-operacionales", href: "/opai/configuracion/documentos-operacionales", label: "Documentos Operacionales", shortLabel: "Docs Op.", icon: ClipboardCheck, module: "config", submodule: "documentos_operacionales", category: "plantillas" },
      // ── Configuración de módulos ──
      { key: "config-crm", href: "/opai/configuracion/crm", label: "CRM", icon: TrendingUp, module: "config", submodule: "crm", category: "modulos" },
      { key: "config-cpq", href: "/opai/configuracion/cpq", label: "CPQ", icon: DollarSign, module: "config", submodule: "cpq", category: "modulos" },
      { key: "config-payroll", href: "/opai/configuracion/payroll", label: "Payroll", icon: Calculator, module: "config", submodule: "payroll", category: "modulos" },
      { key: "config-ops", href: "/opai/configuracion/ops", label: "Operaciones", shortLabel: "Ops", icon: ClipboardList, module: "config", submodule: "ops", category: "modulos" },
      { key: "config-tipos-ticket", href: "/opai/configuracion/tipos-ticket", label: "Tipos de ticket", shortLabel: "Tickets", icon: Ticket, module: "config", submodule: "tipos_ticket", category: "modulos" },
      { key: "config-finanzas", href: "/opai/configuracion/finanzas", label: "Finanzas", icon: Landmark, module: "config", submodule: "finanzas", category: "modulos" },
      { key: "config-alertas-cobertura", href: "/opai/configuracion/alertas-cobertura", label: "Alertas Cobertura", shortLabel: "Alertas", icon: Siren, module: "config", submodule: "alertas_cobertura", category: "modulos" },
      { key: "config-ats", href: "/opai/configuracion/ats", label: "ATS", icon: Briefcase, module: "config", submodule: "ats", category: "modulos" },
      { key: "config-gamificacion", href: "/opai/configuracion/gamificacion", label: "Gamificación", icon: Trophy, module: "config", submodule: "gamificacion", category: "modulos" },
      { key: "config-psicolaboral", href: "/opai/configuracion/psicolaboral", label: "Psicolaboral", icon: Brain, module: "config", submodule: "psicolaboral", category: "modulos" },
      { key: "config-conocimiento", href: "/opai/configuracion/conocimiento", label: "Conocimiento", icon: GraduationCap, module: "config", submodule: "conocimiento", category: "modulos" },
      { key: "config-informes-vulnerabilidad", href: "/opai/configuracion/informes-vulnerabilidad", label: "Informes Vulnerabilidad", shortLabel: "Vulnerab.", icon: ShieldAlert, module: "config", submodule: "informes_vulnerabilidad", category: "modulos" },
      // ── Inteligencia ──
      { key: "config-asistente-ia", href: "/opai/configuracion/asistente-ia", label: "Asistente IA", icon: Brain, module: "config", submodule: "asistente_ia", category: "ia" },
      { key: "config-ia", href: "/opai/configuracion/inteligencia-artificial", label: "Proveedores de IA", shortLabel: "IA", icon: KeyRound, module: "config", submodule: "inteligencia_artificial", category: "ia" },
    ],
  },

  // ═════════════════════════════════════════════════════════
  // PORTALES (admin only)
  // ═════════════════════════════════════════════════════════
  {
    key: "portales",
    href: "/portales",
    label: "Portales",
    icon: Monitor,
    adminOnly: true,
    children: [
      { key: "portal-guardia", href: "/portal/guardia", label: "Portal Guardia", icon: Shield, tenantModule: "portal_guardia" },
      { key: "portal-rondas", href: "/portal/rondas", label: "Portal Rondas", icon: Route, tenantModule: "ops_rondas" },
      { key: "portal-cliente", href: "/portal/cliente", label: "Portal Cliente", icon: Users, tenantModule: "portal_cliente" },
      { key: "portal-marcacion", href: "/portal/marcacion", label: "Portal Marcación", icon: Fingerprint, tenantModule: "portal_marcacion" },
      { key: "portal-acceso", href: "/portal/acceso", label: "Control de Acceso", shortLabel: "Acceso", icon: ScanLine, tenantModule: "control_acceso" },
    ],
  },

  // ═════════════════════════════════════════════════════════
  // CUMPLIMIENTO (compliance) — sólo cuando aplica
  // ═════════════════════════════════════════════════════════
  // Renderizado externamente en buildSidebar usando isComplianceVisible.
];

/* ────────────────────────────────────────────────────────────
 * Lookup helpers
 * ──────────────────────────────────────────────────────────── */

const MODULE_BY_KEY = new Map(NAV_MODULES.map((m) => [m.key, m]));

export function getModule(key: string): NavNode | undefined {
  return MODULE_BY_KEY.get(key);
}

/** Find which top-level module owns this pathname (longest-prefix wins) */
export function findActiveModule(pathname: string): NavNode | undefined {
  let best: { node: NavNode; len: number } | undefined;
  const visit = (node: NavNode) => {
    if (pathname === node.href || pathname.startsWith(node.href + "/")) {
      const len = node.href.length;
      if (!best || len > best.len) best = { node, len };
    }
    node.children?.forEach(visit);
  };
  for (const m of NAV_MODULES) {
    if (pathname === m.href || pathname.startsWith(m.href + "/")) {
      const len = m.href.length;
      if (!best || len > best.len) best = { node: m, len };
    }
  }
  return best?.node;
}

/** Find the deepest N3 parent that contains this pathname (for SubNav N3 rendering) */
export function findN3Parent(pathname: string): NavNode | undefined {
  let best: { node: NavNode; len: number } | undefined;
  const visit = (node: NavNode, depth: number) => {
    // Solo nodos con children y a profundidad >= 1 (sub-módulo o más)
    if (depth >= 1 && node.children && node.children.length > 0) {
      if (pathname === node.href || pathname.startsWith(node.href + "/")) {
        const len = node.href.length;
        if (!best || len > best.len) best = { node, len };
      }
    }
    node.children?.forEach((c) => visit(c, depth + 1));
  };
  NAV_MODULES.forEach((m) => visit(m, 0));
  return best?.node;
}

/* ────────────────────────────────────────────────────────────
 * Special routes detection (overrides)
 * ──────────────────────────────────────────────────────────── */

const PAUTAS_ROUTES = [
  "/ops/pauta-mensual",
  "/ops/pauta-diaria",
  "/ops/turnos-extra",
  "/ops/refuerzos",
  "/ops/ppc",
  "/ops/marcaciones",
  "/ops/audit-pautas",
];

/** Returns the contextual N2 slice for the bottom nav given a pathname.
 *  - Inside Pautas routes → returns Pautas children (N3 promoted to bottom).
 *  - Inside Rondas → Rondas children.
 *  - Inside Inventario → Inventario children.
 *  - Inside Reportes → Informes children.
 *  - Inside Facturación nested routes → Facturación children.
 *  - Otherwise → top-level children of the active module. */
export function getContextualBottomNavNodes(pathname: string): NavNode[] {
  // Pautas — special: any of the PAUTAS_ROUTES → Pautas children
  if (PAUTAS_ROUTES.some((r) => pathname === r || pathname.startsWith(r + "/"))) {
    const opsModule = getModule("ops");
    const pautas = opsModule?.children?.find((c) => c.key === "ops-pautas");
    if (pautas?.children) return pautas.children;
  }

  // Rondas
  if (pathname.startsWith("/ops/rondas")) {
    const opsModule = getModule("ops");
    const rondas = opsModule?.children?.find((c) => c.key === "ops-rondas");
    if (rondas?.children) return rondas.children;
  }

  // Inventario
  if (pathname === "/ops/inventario" || pathname.startsWith("/ops/inventario/")) {
    const opsModule = getModule("ops");
    const inv = opsModule?.children?.find((c) => c.key === "ops-inventario");
    if (inv?.children) return inv.children;
  }

  // Reportes Finanzas
  if (pathname === "/finanzas/reportes" || pathname.startsWith("/finanzas/reportes/")) {
    const fin = getModule("finance");
    const informes = fin?.children?.find((c) => c.key === "finance-informes");
    if (informes?.children) return informes.children;
  }

  // Supervisión
  if (pathname === "/ops/supervision" || pathname.startsWith("/ops/supervision/")) {
    const ops = getModule("ops");
    const sup = ops?.children?.find((c) => c.key === "ops-supervision");
    if (sup?.children) return sup.children;
  }

  // Default: top-level children of active module
  const active = findActiveModule(pathname);
  if (active?.children) return active.children;

  return [];
}
