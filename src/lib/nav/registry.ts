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
  Send,
  BarChart3,
  FileBarChart,
  Scale,
  FileInput,
  Truck,
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
  LayoutDashboard,
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
  /** Custom predicate (combined with the above with AND). Receives the full
   *  VisibilityContext so it can check role-derived flags (e.g. isComplianceVisible). */
  show?: (perms: RolePermissions, ctx?: VisibilityContext) => boolean;
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
  /** Rutas adicionales que pertenecen a este nodo para efectos de estado
   *  activo y breadcrumbs. Se matchean con la misma regla que `href`
   *  (prefijo, salvo que el path termine explícitamente igual). Útil para
   *  familias de rutas hermanas planas (ej. Banca: /finanzas/conciliacion
   *  vive fuera de /finanzas/bancos; Flujo de Caja es N2 propio). */
  activePaths?: string[];
  /** Badge configuration */
  badge?: NavBadge;
  /** Short label for the bottom nav (mobile) when the regular label is too long.
   *  If absent, `label` is used. */
  shortLabel?: string;
  /** One-line description (used by the Config home cards / search to explain
   *  what a section does). Poblado principalmente en los hijos de `config`. */
  description?: string;
  /** When true, this node is shown in the sidebar but not in the bottom nav contextual menu.
   *  Useful for "Inicio" of a module that already shows when you tap the module from the main nav. */
  hideInBottomNav?: boolean;
  /** When true, this node is rendered in the bottom nav but does NOT appear as a row in the
   *  N3 SubNav arriba del contenido. Útil cuando una vista no tiene página propia (ej. accesos rápidos). */
  hideInSubNav?: boolean;
  /** When set, groups this node under a category in the sub-sidebar (used by ConfigShell
   *  to organize many sub-pages — Slack/Notion settings pattern). */
  category?: string;
  /** When true, this module/node is excluded from the sidebar tree but still appears in the
   *  registry (so AutoBreadcrumbs and routing helpers can still find it). Use for items that
   *  have a dedicated UI surface elsewhere — e.g. Configuración (TopbarActions) or Chat
   *  (ChatSidePanel). Default: false. */
  hideInSidebar?: boolean;
  /** When true, este módulo NO renderiza tabs de secciones en la topbar
   *  (TopbarSubNav). Lo usa Configuración, que navega por hub + categorías en
   *  su propio shell (ConfigShell) en vez de la fila de tabs superior. */
  hideInModuleTabs?: boolean;
}

/** Order + label for sub-sidebar categories. Las categorías de Configuración
 *  son además navegables (nivel 2): tienen `href`, `icon` y `description`. */
export interface NavCategory {
  key: string;
  label: string;
  /** Ruta del nivel 2 de la categoría (ej. "/opai/configuracion/general"). */
  href?: string;
  /** Ícono para las tarjetas del hub y la cabecera del sub-sidebar. */
  icon?: LucideIcon;
  /** Descripción de una línea para las tarjetas del hub. */
  description?: string;
}

/* ────────────────────────────────────────────────────────────
 * Visibility helper
 * ──────────────────────────────────────────────────────────── */

export interface VisibilityContext {
  perms: RolePermissions;
  isAdmin: boolean;
  isModuleEnabled: (mod: string) => boolean;
  /** True when the user role matches owner/admin/rrhh — used by compliance module. */
  isComplianceVisible?: boolean;
  /** Feature flags finos del tenant (TenantModule.config JSONB). Opcional:
   *  las superficies que no lo proveen se comportan como flag OFF. */
  hasTenantFlag?: (flag: string) => boolean;
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
  if (node.show && !node.show(ctx.perms, ctx)) return false;
  return true;
}

/** Filter children of a node by visibility rules */
export function filterChildren(node: NavNode, ctx: VisibilityContext): NavNode[] {
  return (node.children ?? []).filter((c) => isNodeVisible(c, ctx));
}

/** Matching canónico de un nodo contra un pathname. Único lugar donde vive
 *  la regla — todos los consumidores (sidebar, bottom nav, breadcrumbs,
 *  SwipeTabs, ConfigShell) deben usar esto en vez de duplicar la lógica. */
export function pathMatchesNode(
  pathname: string,
  node: Pick<NavNode, "href" | "exactMatch" | "activePaths">,
): boolean {
  const matchOne = (base: string) =>
    node.exactMatch
      ? pathname === base
      : pathname === base || pathname.startsWith(base + "/");
  if (matchOne(node.href)) return true;
  return (node.activePaths ?? []).some((p) =>
    pathname === p || pathname.startsWith(p + "/"),
  );
}

/* ────────────────────────────────────────────────────────────
 * REGISTRY — the only source of truth
 * ──────────────────────────────────────────────────────────── */

/** Categorías ordenadas para el hub y el sub-sidebar de Configuración.
 *  Cada categoría es un destino navegable (nivel 2): href + icon + description.
 *  Los slugs (general/permisos/comunicacion/plantillas/modulos/ia) NO colisionan
 *  con ningún directorio de página hoja bajo `configuracion/`. */
export const CONFIG_CATEGORIES: NavCategory[] = [
  { key: "general", label: "General", href: "/opai/configuracion/general", icon: Settings2, description: "Empresa, plan, cumplimiento y auditoría" },
  { key: "permisos", label: "Permisos", href: "/opai/configuracion/permisos", icon: KeyRound, description: "Usuarios, roles y grupos de aprobación" },
  { key: "comunicacion", label: "Comunicación", href: "/opai/configuracion/comunicacion", icon: Mail, description: "Integraciones, notificaciones, correos y firmas" },
  { key: "plantillas", label: "Plantillas", href: "/opai/configuracion/plantillas", icon: LayoutTemplate, description: "Categorías y documentos operacionales" },
  { key: "modulos", label: "Módulos", href: "/opai/configuracion/modulos", icon: Layers, description: "Parámetros de CRM, CPQ, Payroll, Ops, Finanzas y más" },
  { key: "ia", label: "Inteligencia Artificial", href: "/opai/configuracion/ia", icon: Brain, description: "Asistente y proveedores de inteligencia artificial" },
];

/** Rutas hermanas planas del sub-módulo Pautas (viven fuera de
 *  `/ops/pauta-mensual`). Se declaran arriba de NAV_MODULES para poder
 *  referenciarlas como `activePaths` del nodo `ops-pautas` — así el
 *  auto-detect del SubNav/topbar resuelve el grupo Pautas sin que cada
 *  página tenga que forzar `moduleKey`. También las consume
 *  `getContextualBottomNavNodes`. */
const PAUTAS_ROUTES = [
  "/ops/pauta-mensual",
  "/ops/pauta-diaria",
  "/ops/refuerzos",
  "/ops/ppc",
  "/ops/marcaciones",
  "/ops/audit-pautas",
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
    // hideInBottomNav en TODOS los hijos: el bottom bar móvil es navegación
    // GLOBAL (Inicio/Comercial/Operaciones/…) también dentro de /hub. Las
    // vistas del Centro de Control se cambian arriba (ModuleSubNav desktop,
    // HubMobileViewPicker mobile), nunca desde la isla inferior.
    children: [
      {
        key: "hub-summary",
        href: "/hub",
        label: "Resumen",
        icon: Grid3x3,
        module: "hub",
        exactMatch: true,
        hideInBottomNav: true,
      },
      {
        key: "hub-commercial",
        href: "/hub/comercial",
        label: "Comercial",
        icon: TrendingUp,
        module: "crm",
        tenantModule: "crm",
        hideInBottomNav: true,
      },
      {
        key: "hub-operations",
        href: "/hub/operaciones",
        label: "Operaciones",
        shortLabel: "Ops",
        icon: Activity,
        module: "ops",
        hideInBottomNav: true,
      },
      {
        key: "hub-finance",
        href: "/hub/finanzas",
        label: "Finanzas",
        icon: Landmark,
        module: "finance",
        tenantModule: "finanzas",
        hideInBottomNav: true,
      },
      {
        key: "hub-people",
        href: "/hub/personas",
        label: "Personas",
        icon: Users,
        module: "ops",
        submodule: "guardias",
        hideInBottomNav: true,
      },
      {
        key: "hub-payroll",
        href: "/hub/payroll",
        label: "Payroll",
        icon: Wallet,
        module: "payroll",
        hideInBottomNav: true,
      },
      {
        key: "hub-documents",
        href: "/hub/documentos",
        label: "Documentos",
        shortLabel: "Docs",
        icon: FolderOpen,
        module: "docs",
        hideInBottomNav: true,
      },
    ],
  },

  // ═════════════════════════════════════════════════════════
  // PRODUCTIVIDAD (Inicio, Correos, Agenda, Tareas)
  // ═════════════════════════════════════════════════════════
  {
    key: "productividad",
    href: "/productividad/inicio",
    label: "Productividad",
    icon: Sparkles,
    module: "productividad",
    // El cambio de superficie vive en el SurfaceSegment del topbar/isla.
    // No duplicar el portal como ítem del sidebar ERP (flyout redundante).
    hideInSidebar: true,
    // Home propio de la superficie. Correos/Tareas/Agenda/Tickets se
    // declaran como activePaths para que findActiveModule/breadcrumbs
    // los resuelvan a este nodo (rutas hermanas planas).
    activePaths: [
      "/opai/agenda",
      "/crm/correos",
      "/opai/tareas",
      "/opai/auditoria-productividad",
      "/ops/tickets",
    ],
    children: [
      // hideInBottomNav: la isla inferior mantiene Correos · Tareas · Agenda · Tickets.
      {
        key: "productividad-inicio",
        href: "/productividad/inicio",
        label: "Inicio",
        icon: LayoutDashboard,
        module: "productividad",
        exactMatch: true,
        hideInBottomNav: true,
      },
      // Orden desktop/sidebar: Inicio → Correos → Tareas → Agenda → Tickets.
      // Correos conserva tenantModule "crm": la casilla Gmail vive en el plan
      // CRM, así se oculta para tenants sin ese módulo (acoplamiento conocido).
      { key: "productividad-correos", href: "/crm/correos", label: "Correos", icon: Mail, module: "productividad", submodule: "correos", tenantModule: "crm" },
      { key: "productividad-tareas", href: "/opai/tareas", label: "Tareas", icon: ClipboardList, module: "productividad", submodule: "tareas" },
      { key: "productividad-agenda", href: "/opai/agenda", label: "Agenda", icon: CalendarDays, module: "productividad", submodule: "agenda" },
      // Tickets — la casa es Productividad (seguimiento transversal). Conserva
      // href /ops/tickets y su gating de Ops (la ficha/lista de tickets vive en
      // Ops); la creación desde correo se habilita con Productividad (API).
      {
        key: "ops-tickets",
        href: "/ops/tickets",
        label: "Tickets",
        icon: Ticket,
        module: "ops",
        submodule: "tickets",
        badge: { notesKey: "ticket" },
      },
      {
        key: "productividad-auditoria",
        href: "/opai/auditoria-productividad",
        label: "Auditoría",
        icon: FileBarChart,
        module: "productividad",
        submodule: "tareas",
        adminOnly: true,
        description: "Historial de cambios en tareas y agenda (solo administradores)",
      },
    ],
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
      { key: "crm-installations", href: "/crm/installations", label: "Instalaciones", icon: MapPin, module: "crm", submodule: "installations", badge: { notesKey: "installation" } },
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
      // Rendiciones — con N3 (Resumen + Aprobaciones + Pagos)
      {
        key: "finance-rendiciones",
        href: "/finanzas/rendiciones",
        label: "Rendiciones",
        shortLabel: "Rendic.",
        icon: Receipt,
        module: "finance",
        submodule: "rendiciones",
        badge: { notesKey: "rendicion" },
        children: [
          {
            key: "rend-resumen",
            href: "/finanzas/rendiciones",
            label: "Rendiciones",
            shortLabel: "Lista",
            icon: Receipt,
            exactMatch: true,
            module: "finance",
            submodule: "rendiciones",
          },
          {
            key: "rend-historial-pagos",
            href: "/finanzas/rendiciones/historial-pagos",
            label: "Historial de pagos",
            shortLabel: "Pagos",
            icon: Wallet,
            capability: "rendicion_pay",
            module: "finance",
            submodule: "rendiciones",
            // Detalle vivo /finanzas/pagos/[id] pertenece a este N3 (la lista
            // /finanzas/pagos es redirect legacy a /finanzas/rendiciones/pagos).
            activePaths: ["/finanzas/pagos"],
          },
        ],
      },
      // Compras y Ventas (Facturación + Proveedores) — con N3.
      // Unifica DTEs Emitidos (ventas) + DTEs Recibidos (compras) +
      // Proveedores en una sola entrada. La pestaña "Compras" antes era
      // una entrada N2 separada que apuntaba a /finanzas/proveedores —
      // ahora Proveedores vive como child después del Libro IVA.
      // Restringido a owner/admin (purchases_view) o roles con
      // facturacion explícita.
      {
        key: "finance-compras-ventas",
        href: "/finanzas/facturacion",
        label: "Compras y Ventas",
        shortLabel: "C/V",
        icon: FileText,
        module: "finance",
        submodule: "facturacion",
        // 2026-05-13: política Opai — solo owner/admin (purchases_view) ven
        // Compras y Ventas. Quitados fallbacks canView "facturacion" /
        // "proveedores" para que roles legacy con esos submodule grants no
        // hereden acceso. Tenants que necesiten delegar deben otorgar
        // capabilities granulares vía /opai/configuracion/roles.
        show: (perms) => hasCapability(perms, "purchases_view"),
        children: [
          { key: "cv-resumen", href: "/finanzas/facturacion", label: "Resumen", icon: Grid3x3, exactMatch: true, module: "finance", submodule: "facturacion" },
          { key: "cv-dtes", href: "/finanzas/facturacion/dtes", label: "DTEs Emitidos", icon: FileText, module: "finance", submodule: "facturacion" },
          { key: "cv-recibidos", href: "/finanzas/facturacion/recibidos", label: "DTEs Recibidos", icon: FileInput, module: "finance", submodule: "facturacion" },
          { key: "cv-programacion", href: "/finanzas/facturacion/programacion", label: "Programación", icon: CalendarDays, module: "finance", submodule: "facturacion" },
          { key: "cv-envios", href: "/finanzas/facturacion/envios", label: "Envíos", icon: Send, module: "finance", submodule: "facturacion" },
          { key: "cv-libro-iva", href: "/finanzas/facturacion/libro-iva", label: "Libro IVA", icon: BookText, module: "finance", submodule: "facturacion" },
          { key: "cv-proveedores", href: "/finanzas/proveedores", label: "Proveedores", icon: Truck, module: "finance", submodule: "proveedores" },
          { key: "cv-folios", href: "/finanzas/facturacion/folios", label: "Folios", icon: FileText, module: "finance", submodule: "facturacion" },
          { key: "cv-cesiones", href: "/finanzas/facturacion/cesiones", label: "Cesiones", icon: DollarSign, module: "finance", submodule: "facturacion" },
        ],
      },
      // Banca — restringido a owner/admin (banking_view). Con N3:
      // Conciliación / Cuentas y cartolas.
      // Flujo de Caja es N2 hermano (no vive bajo Banca): evita la duplicación
      // tab-in-page + bottom-nav que confundía en mobile.
      {
        key: "finance-banca",
        href: "/finanzas/bancos",
        label: "Banca",
        icon: Landmark,
        module: "finance",
        submodule: "contabilidad",
        show: (perms) => hasCapability(perms, "banking_view"),
        // Conciliación vive fuera de /finanzas/bancos (ruta hermana plana).
        activePaths: ["/finanzas/conciliacion"],
        children: [
          {
            key: "banca-conciliacion",
            href: "/finanzas/conciliacion",
            label: "Conciliación",
            shortLabel: "Concil.",
            icon: CheckCircle2,
            module: "finance",
            submodule: "contabilidad",
          },
          {
            key: "banca-cuentas",
            href: "/finanzas/bancos",
            label: "Cuentas y cartolas",
            shortLabel: "Cuentas",
            icon: Landmark,
            exactMatch: true,
            show: (perms) => hasCapability(perms, "banking_view"),
          },
        ],
      },
      // Flujo de Caja — N2 propio (hermano de Banca). Modo Planilla es la
      // ÚNICA vista del producto; /finanzas/flujo-caja redirige a planilla.
      {
        key: "finance-flujo-caja",
        href: "/finanzas/flujo-caja/planilla",
        label: "Flujo de Caja",
        shortLabel: "Flujo",
        icon: TrendingUp,
        capability: "cashflow_view",
        // Ruta histórica + sub-rutas (cierre/cuadratura redirigen a planilla).
        activePaths: ["/finanzas/flujo-caja"],
      },
      // Contabilidad — restringido a owner/admin (accounting_view)
      {
        key: "finance-contabilidad",
        href: "/finanzas/contabilidad",
        label: "Contabilidad",
        shortLabel: "Contab.",
        icon: BookText,
        module: "finance",
        submodule: "contabilidad",
        // 2026-05-13: solo accounting_view (owner/admin). Roles con
        // contabilidad_manage que necesiten seguir viendo el módulo deben
        // recibir accounting_view explícitamente desde /configuracion/roles.
        show: (perms) => hasCapability(perms, "accounting_view"),
      },
      // Informes (Reportes) — restringido a owner/admin (reports_finance_view)
      {
        key: "finance-informes",
        href: "/finanzas/reportes",
        label: "Informes",
        icon: BarChart3,
        module: "finance",
        submodule: "reportes",
        // 2026-05-13: solo reports_finance_view (owner/admin). El legacy
        // finance_reports_view ya no concede acceso al nav.
        show: (perms) => hasCapability(perms, "reports_finance_view"),
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
        // Rutas hermanas planas (pauta-diaria, ppc, refuerzos, marcaciones,
        // audit-pautas) viven fuera de /ops/pauta-mensual. Declararlas como
        // activePaths permite que findN3Parent/topbar resuelvan "Pautas"
        // sin que cada página fuerce moduleKey.
        activePaths: PAUTAS_ROUTES,
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
          { key: "pautas-ppc", href: "/ops/ppc", label: "PPC", icon: ShieldAlert, module: "ops", submodule: "ppc" },
          { key: "pautas-refuerzos", href: "/ops/refuerzos", label: "Refuerzos", icon: Shield, module: "ops", submodule: "turnos_extra" },
          { key: "pautas-marcaciones", href: "/ops/marcaciones", label: "Marcaciones", icon: Fingerprint, module: "ops", submodule: "marcaciones" },
          { key: "pautas-auditoria", href: "/ops/audit-pautas", label: "Auditoría", icon: ClipboardList, module: "ops", submodule: "pauta_mensual" },
        ],
      },
      // Turnos Extra (sub-módulo con N3: Registro, Aprobaciones, Lotes, Pagos)
      {
        key: "ops-turnos-extra",
        href: "/ops/turnos-extra/registro",
        label: "Turnos Extra",
        icon: Clock3,
        module: "ops",
        submodule: "turnos_extra",
        children: [
          { key: "te-registro", href: "/ops/turnos-extra/registro", label: "Registro", icon: ClipboardList, module: "ops", submodule: "turnos_extra" },
          { key: "te-aprobaciones", href: "/ops/turnos-extra/aprobaciones", label: "Aprobaciones", icon: CheckCircle2, module: "ops", submodule: "turnos_extra" },
          { key: "te-lotes", href: "/ops/turnos-extra/lotes", label: "Lotes", icon: Layers, module: "ops", submodule: "turnos_extra" },
          { key: "te-pagos", href: "/ops/turnos-extra/pagos", label: "Pagos", icon: Banknote, module: "ops", submodule: "turnos_extra" },
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
    // href = raíz del módulo (no el submódulo Listado). `/personas` redirige a
    // `/personas/guardias` (ver personas/page.tsx), pero el href DEBE ser la
    // raíz para que el matcher por prefijo (`pathMatchesNode`) resuelva el
    // módulo en TODOS los submódulos (`/personas/conocimiento`, `/onboarding`,
    // …) y no solo en Listado. Con el href apuntando a `/personas/guardias`,
    // findActiveModule/buildTrail fallaban fuera de Listado y la barra
    // superior / breadcrumbs / isla móvil quedaban sin resolver.
    href: "/personas",
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
  // DOCUMENTOS
  // ═════════════════════════════════════════════════════════
  {
    key: "docs",
    href: "/opai/documentos",
    label: "Documentos",
    icon: FolderOpen,
    module: "docs",
    tenantModule: "documentos",
    // /opai/documentos-operativos es hermano plano de /opai/documentos (no es
    // sub-ruta con "/"), así que se declara para que findActiveModule/breadcrumbs
    // lo resuelvan al módulo Documentos.
    activePaths: ["/opai/documentos-operativos"],
    children: [
      { key: "docs-gestion", href: "/opai/documentos", label: "Gestión", icon: FolderOpen, module: "docs", submodule: "gestion", badge: { notesKey: "document" }, exactMatch: true },
      { key: "docs-operativos", href: "/opai/documentos-operativos", label: "Operativos", icon: ClipboardCheck, module: "docs", submodule: "operativos" },
      { key: "docs-templates", href: "/opai/documentos/templates", label: "Templates", icon: LayoutTemplate, module: "docs", submodule: "plantillas" },
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
    hideInSidebar: true,
    // Configuración navega por hub + categorías en su propio shell
    // (ConfigShell), no por la fila de tabs de la topbar → no la renderiza.
    hideInModuleTabs: true,
    children: [
      // ── General ──
      { key: "config-inicio", href: "/opai/configuracion/inicio", label: "Modo de inicio", shortLabel: "Inicio", icon: LayoutDashboard, module: "config", category: "general", description: "Elige si al entrar abres ERP o Productividad (login y PWA)" },
      { key: "config-empresa", href: "/opai/configuracion/empresa", label: "Empresa", icon: Building2, module: "config", submodule: "empresa", category: "general", description: "Razón social, RUT, dirección, representante legal" },
      { key: "config-mi-plan", href: "/opai/configuracion/mi-plan", label: "Mi Plan", icon: Sparkles, module: "config", submodule: "mi_plan", category: "general", description: "Plan actual, módulos, add-ons y solicitar upgrade" },
      { key: "config-cumplimiento", href: "/opai/configuracion/cumplimiento", label: "Cumplimiento", icon: Shield, module: "config", submodule: "cumplimiento", category: "general", description: "Contacto del DPO y estado del DPA" },
      { key: "config-auditoria", href: "/opai/configuracion/auditoria", label: "Auditoría", icon: FileBarChart, module: "config", submodule: "auditoria", category: "general", description: "Registro de acciones y cambios por usuario" },
      // ── Permisos ──
      { key: "config-usuarios", href: "/opai/configuracion/usuarios", label: "Usuarios", icon: Users, module: "config", submodule: "usuarios", category: "permisos", description: "Gestión de usuarios y asignación de roles" },
      { key: "config-roles", href: "/opai/configuracion/roles", label: "Roles y Permisos", shortLabel: "Roles", icon: KeyRound, module: "config", submodule: "roles", category: "permisos", description: "Configurar permisos por módulo y submódulo" },
      { key: "config-grupos", href: "/opai/configuracion/grupos", label: "Grupos", icon: Users, module: "config", submodule: "grupos", category: "permisos", description: "Grupos organizacionales para cadenas de aprobación" },
      // ── Comunicación ──
      { key: "config-integraciones", href: "/opai/configuracion/integraciones", label: "Integraciones", icon: Plug, module: "config", submodule: "integraciones", category: "comunicacion", description: "Gmail y conectores externos" },
      { key: "config-notificaciones", href: "/opai/configuracion/notificaciones", label: "Notificaciones", shortLabel: "Notif.", icon: Bell, module: "config", submodule: "notificaciones", category: "comunicacion", description: "Parámetros globales" },
      { key: "config-correos-automaticos", href: "/opai/configuracion/correos-automaticos", label: "Correos automáticos", shortLabel: "Correos", icon: Mail, adminOnly: true, category: "comunicacion", description: "Activa o desactiva los correos transaccionales que OPAI envía desde tu empresa" },
      { key: "config-firmas", href: "/opai/configuracion/firmas", label: "Firmas", icon: PenLine, module: "config", submodule: "firmas", category: "comunicacion", description: "Firmas para correos salientes" },
      // ── Plantillas ──
      { key: "config-categorias", href: "/opai/configuracion/categorias-plantillas", label: "Categorías Plantillas", shortLabel: "Categorías", icon: FolderTree, module: "config", submodule: "categorias", category: "plantillas", description: "Categorías por módulo para Gestión Documental" },
      { key: "config-documentos-operacionales", href: "/opai/configuracion/documentos-operacionales", label: "Documentos Operacionales", shortLabel: "Docs Op.", icon: ClipboardCheck, module: "config", submodule: "documentos_operacionales", category: "plantillas", description: "OS10, seguros, documentos por instalación, guardias" },
      // ── Configuración de módulos ──
      { key: "config-crm", href: "/opai/configuracion/crm", label: "CRM", icon: TrendingUp, module: "config", submodule: "crm", category: "modulos", description: "Pipeline y automatizaciones" },
      { key: "config-cpq", href: "/opai/configuracion/cpq", label: "CPQ", icon: DollarSign, module: "config", submodule: "cpq", category: "modulos", description: "Catálogo, parámetros y pricing" },
      { key: "config-payroll", href: "/opai/configuracion/payroll", label: "Payroll", icon: Calculator, module: "config", submodule: "payroll", category: "modulos", description: "Parámetros legales y versiones" },
      { key: "config-ops", href: "/opai/configuracion/ops", label: "Operaciones", shortLabel: "Ops", icon: ClipboardList, module: "config", submodule: "ops", category: "modulos", description: "Marcaciones, emails y parámetros" },
      { key: "config-tipos-ticket", href: "/opai/configuracion/tipos-ticket", label: "Tipos de ticket", shortLabel: "Tickets", icon: Ticket, module: "config", submodule: "tipos_ticket", category: "modulos", description: "Solicitudes, aprobación y SLA" },
      { key: "config-finanzas", href: "/opai/configuracion/finanzas", label: "Finanzas", icon: Landmark, module: "config", submodule: "finanzas", category: "modulos", description: "Rendiciones, kilometraje y reglas" },
      { key: "config-alertas-cobertura", href: "/opai/configuracion/alertas-cobertura", label: "Alertas Cobertura", shortLabel: "Alertas", icon: Siren, module: "config", submodule: "alertas_cobertura", category: "modulos", description: "Oleadas, tiempos y canales" },
      { key: "config-ats", href: "/opai/configuracion/ats", label: "ATS", icon: Briefcase, module: "config", submodule: "ats", category: "modulos", description: "Match score, canales y distribución" },
      { key: "config-gamificacion", href: "/opai/configuracion/gamificacion", label: "Gamificación", icon: Trophy, module: "config", submodule: "gamificacion", category: "modulos", description: "Pesos, niveles, puntos y badges" },
      { key: "config-psicolaboral", href: "/opai/configuracion/psicolaboral", label: "Psicolaboral", icon: Brain, module: "config", submodule: "psicolaboral", category: "modulos", description: "Pesos, umbrales y plantillas de invitación" },
      { key: "config-conocimiento", href: "/opai/configuracion/conocimiento", label: "Conocimiento", icon: GraduationCap, module: "config", submodule: "conocimiento", category: "modulos", description: "Frecuencia de exámenes recurrentes, recordatorios y deadlines" },
      { key: "config-informes-vulnerabilidad", href: "/opai/configuracion/informes-vulnerabilidad", label: "Informes Vulnerabilidad", shortLabel: "Vulnerab.", icon: ShieldAlert, module: "config", submodule: "informes_vulnerabilidad", category: "modulos", description: "Configura las secciones de informes generados por IA" },
      // ── Inteligencia ──
      { key: "config-asistente-ia", href: "/opai/configuracion/asistente-ia", label: "Asistente IA", icon: Brain, module: "config", submodule: "asistente_ia", category: "ia", description: "Control de roles, acceso y alcance del chat conversacional" },
      { key: "config-ia", href: "/opai/configuracion/inteligencia-artificial", label: "Proveedores de IA", shortLabel: "IA", icon: KeyRound, module: "config", submodule: "inteligencia_artificial", category: "ia", description: "Conecta tu propia API key (OpenAI, Anthropic, Google) y elige el modelo" },
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
  // CUMPLIMIENTO (compliance) — sólo cuando aplica (owner/admin/rrhh)
  // ═════════════════════════════════════════════════════════
  {
    key: "compliance",
    href: "/opai/compliance/arco",
    label: "Cumplimiento",
    icon: Shield,
    show: (_perms, ctx) => Boolean(ctx?.isComplianceVisible),
    children: [
      {
        key: "compliance-arco",
        href: "/opai/compliance/arco",
        label: "Solicitudes ARCO",
        icon: Shield,
      },
    ],
  },
];

/* ────────────────────────────────────────────────────────────
 * Lookup helpers
 * ──────────────────────────────────────────────────────────── */

const MODULE_BY_KEY = new Map(NAV_MODULES.map((m) => [m.key, m]));

export function getModule(key: string): NavNode | undefined {
  return MODULE_BY_KEY.get(key);
}

/* ────────────────────────────────────────────────────────────
 * Configuración — helpers de categorías (nivel 2)
 * ──────────────────────────────────────────────────────────── */

/** Categoría de Configuración por slug (general/permisos/…). */
export function getConfigCategory(slug: string): NavCategory | undefined {
  return CONFIG_CATEGORIES.find((c) => c.key === slug);
}

/** Sección de Configuración (hijo del nodo `config`) que posee este pathname,
 *  longest-prefix-wins. Resuelve también rutas anidadas de hojas
 *  (ej. `/opai/configuracion/integraciones/slack` → sección "Integraciones"). */
export function getConfigSectionOf(pathname: string): NavNode | undefined {
  const config = getModule("config");
  return (config?.children ?? [])
    .filter((c) => pathMatchesNode(pathname, c))
    .sort((a, b) => b.href.length - a.href.length)[0];
}

/** Categoría de Configuración a la que pertenece un pathname, derivada de la
 *  sección que lo matchea (misma regla longest-prefix que useConfigCategories).
 *  Si el pathname es la propia ruta de categoría (`/opai/configuracion/<slug>`),
 *  resuelve por slug directo. */
export function getConfigCategoryOf(pathname: string): NavCategory | undefined {
  const CONFIG_BASE = "/opai/configuracion/";
  if (pathname.startsWith(CONFIG_BASE)) {
    const slug = pathname.slice(CONFIG_BASE.length).split("/")[0];
    const direct = getConfigCategory(slug);
    if (direct) return direct;
  }
  const section = getConfigSectionOf(pathname);
  return section?.category ? getConfigCategory(section.category) : undefined;
}

/** Find which top-level module owns this pathname (longest-prefix wins) */
export function findActiveModule(pathname: string): NavNode | undefined {
  let best: { node: NavNode; len: number } | undefined;
  for (const m of NAV_MODULES) {
    if (pathMatchesNode(pathname, m)) {
      const len = m.href.length;
      if (!best || len > best.len) best = { node: m, len };
    }
  }
  return best?.node;
}

/** Find any node in the tree by its key (DFS across all modules). */
export function findChildByKey(key: string): NavNode | undefined {
  const visit = (node: NavNode): NavNode | undefined => {
    if (node.key === key) return node;
    for (const c of node.children ?? []) {
      const r = visit(c);
      if (r) return r;
    }
    return undefined;
  };
  for (const m of NAV_MODULES) {
    const r = visit(m);
    if (r) return r;
  }
  return undefined;
}

/** Find the deepest N3 parent that contains this pathname (for SubNav N3 rendering) */
export function findN3Parent(pathname: string): NavNode | undefined {
  let best: { node: NavNode; len: number } | undefined;
  const visit = (node: NavNode, depth: number) => {
    // Solo nodos con children y a profundidad >= 1 (sub-módulo o más)
    if (depth >= 1 && node.children && node.children.length > 0) {
      if (pathMatchesNode(pathname, node)) {
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

/** Returns the contextual N2 slice for the bottom nav given a pathname.
 *  - Inside Pautas routes → returns Pautas children (N3 promoted to bottom).
 *  - Inside Rondas → Rondas children.
 *  - Inside Inventario → Inventario children.
 *  - Inside Supervisión → Supervisión children.
 *  - Otherwise → top-level children of the active module. */
export function getContextualBottomNavNodes(pathname: string): NavNode[] {
  // Pautas — special: any of the PAUTAS_ROUTES → Pautas children
  if (PAUTAS_ROUTES.some((r) => pathname === r || pathname.startsWith(r + "/"))) {
    const opsModule = getModule("ops");
    const pautas = opsModule?.children?.find((c) => c.key === "ops-pautas");
    if (pautas?.children) return pautas.children;
  }

  // Turnos Extra
  if (pathname === "/ops/turnos-extra" || pathname.startsWith("/ops/turnos-extra/")) {
    const opsModule = getModule("ops");
    const te = opsModule?.children?.find((c) => c.key === "ops-turnos-extra");
    if (te?.children) return te.children;
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

  // Supervisión
  if (pathname === "/ops/supervision" || pathname.startsWith("/ops/supervision/")) {
    const ops = getModule("ops");
    const sup = ops?.children?.find((c) => c.key === "ops-supervision");
    if (sup?.children) return sup.children;
  }

  // Banca / Flujo de Caja: igual que el resto de Finanzas (Reportes, C/V,
  // Rendiciones) — el bottom nav siempre muestra N2. El N3 de Banca
  // (Conciliación / Cuentas) vive en TopbarSubNav + FinanceN3Chips.

  // Default: top-level children of active module
  const active = findActiveModule(pathname);
  if (active?.children) return active.children;

  return [];
}
