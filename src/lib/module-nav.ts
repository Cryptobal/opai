/**
 * Module Navigation — Configuración centralizada para bottom nav contextual.
 *
 * Define los sub-items de cada módulo con iconos, labels y hrefs.
 * Usado por BottomNav para mostrar navegación contextual cuando el usuario
 * está dentro de un módulo específico.
 *
 * Patrón mobile-first nivel Salesforce/HubSpot: al entrar en un módulo,
 * el bottom nav muestra las subcategorías del módulo en lugar del menú principal.
 */

import type { LucideIcon } from "lucide-react";
import {
  Grid3x3,
  FileText,
  Building2,
  Calculator,
  ClipboardList,
  Settings,
  Receipt,
  BarChart3,
  Landmark,
  BookText,
  ClipboardCheck,
  Users,
  User,
  MapPin,
  TrendingUp,
  Contact,
  DollarSign,
  Activity,
  CalendarDays,
  Route,
  Moon,
  Ticket,
  Package,
  CheckCircle2,
  Banknote,
  Wallet,
  Layers,
  FolderOpen,
  Plug,
  Bell,
  Sparkles,
  MessageSquare,
} from "lucide-react";
import {
  type RolePermissions,
  getDefaultPermissions,
  hasModuleAccess,
  canView,
} from "./permissions";

/* ── Types ── */

export interface BottomNavItem {
  key: string;
  href: string;
  label: string;
  icon: LucideIcon;
  /** Si true, el item es un ancla de sección (scroll) en vez de un link de navegación */
  isSection?: boolean;
}

/* ── Main nav items ── */

const MAIN_ITEMS: (BottomNavItem & { app: string })[] = [
  { key: "hub", href: "/hub", label: "Inicio", icon: Grid3x3, app: "hub" },
  { key: "chat", href: "/chat", label: "Chat", icon: MessageSquare, app: "hub" },
  { key: "crm", href: "/crm", label: "Comercial", icon: TrendingUp, app: "crm" },
  { key: "ops", href: "/ops", label: "Operaciones", icon: Activity, app: "ops" },
  { key: "personas", href: "/personas/guardias", label: "Personas", icon: User, app: "ops" },
  { key: "payroll", href: "/payroll", label: "Payroll", icon: Wallet, app: "payroll" },
  { key: "finance", href: "/finanzas", label: "Finanzas", icon: Landmark, app: "finance" },
  { key: "docs", href: "/opai/inicio", label: "Documentos", icon: FolderOpen, app: "docs" },
  { key: "config", href: "/opai/configuracion", label: "Config", icon: Settings, app: "admin" },
];

/* ── CRM sub-items ── */

const CRM_ITEMS: (BottomNavItem & { subKey: string })[] = [
  { key: "crm-leads", href: "/crm/leads", label: "Leads", icon: Users, subKey: "leads" },
  { key: "crm-accounts", href: "/crm/accounts", label: "Cuentas", icon: Building2, subKey: "accounts" },
  { key: "crm-installations", href: "/crm/installations", label: "Instalaciones", icon: MapPin, subKey: "installations" },
  { key: "crm-contacts", href: "/crm/contacts", label: "Contactos", icon: Contact, subKey: "contacts" },
  { key: "crm-deals", href: "/crm/deals", label: "Negocios", icon: TrendingUp, subKey: "deals" },
  { key: "crm-quotes", href: "/crm/cotizaciones", label: "Cotizaciones", icon: DollarSign, subKey: "quotes" },
];

/* ── Ops sub-items (alineados con sidebar) ── */

const OPS_ITEMS: (BottomNavItem & { subKey: string })[] = [
  { key: "ops-pautas", href: "/ops/pautas", label: "Pautas", icon: CalendarDays, subKey: "pautas" },
  { key: "ops-supervision", href: "/ops/supervision", label: "Supervisión", icon: ClipboardCheck, subKey: "supervision" },
  { key: "ops-tickets", href: "/ops/tickets", label: "Tickets", icon: Ticket, subKey: "tickets" },
  { key: "ops-rondas", href: "/ops/rondas", label: "Rondas", icon: Route, subKey: "rondas" },
  { key: "ops-control-nocturno", href: "/ops/control-nocturno", label: "Control Nocturno", icon: Moon, subKey: "control_nocturno" },
  { key: "ops-inventario", href: "/ops/inventario", label: "Inventario", icon: Package, subKey: "inventario" },
];

/* ── TE sub-items ── */

const TE_ITEMS: BottomNavItem[] = [
  { key: "te-registro", href: "/te/registro", label: "Registro", icon: ClipboardList },
  { key: "te-aprobaciones", href: "/te/aprobaciones", label: "Aprobaciones", icon: CheckCircle2 },
  { key: "te-lotes", href: "/te/lotes", label: "Lotes", icon: Layers },
  { key: "te-pagos", href: "/te/pagos", label: "Pagos", icon: Banknote },
];

/* ── Personas sub-items ── */

const PERSONAS_ITEMS: BottomNavItem[] = [
  { key: "personas-listado", href: "/personas/guardias", label: "Listado", icon: User },
  { key: "personas-sueldos-rut", href: "/personas/guardias/sueldos-rut", label: "Sueldos RUT", icon: DollarSign },
];

/* ── Payroll sub-items ── */

const PAYROLL_ITEMS: BottomNavItem[] = [
  { key: "payroll-periodos", href: "/payroll/periodos", label: "Períodos", icon: CalendarDays },
  { key: "payroll-anticipos", href: "/payroll/anticipos", label: "Anticipos", icon: Banknote },
  { key: "payroll-simulator", href: "/payroll/simulator", label: "Simulador", icon: Calculator },
  { key: "payroll-parameters", href: "/payroll/parameters", label: "Parámetros", icon: FileText },
];

/* ── Docs sub-items ── */

const DOCS_ITEMS: BottomNavItem[] = [
  { key: "docs-presentaciones", href: "/opai/inicio", label: "Envíos", icon: FileText },
  { key: "docs-gestion", href: "/opai/documentos", label: "Gestión", icon: FolderOpen },
];

/* ── Finance sub-items ── */

const FINANCE_ITEMS: (BottomNavItem & {
  subKey: "rendiciones" | "facturacion" | "proveedores" | "contabilidad" | "reportes";
})[] = [
    { key: "finance-rendiciones", href: "/finanzas/rendiciones", label: "Rendic.", icon: Receipt, subKey: "rendiciones" },
    { key: "finance-ventas", href: "/finanzas/facturacion", label: "Ventas", icon: FileText, subKey: "facturacion" },
    { key: "finance-compras", href: "/finanzas/proveedores", label: "Compras", icon: Building2, subKey: "proveedores" },
    { key: "finance-banca", href: "/finanzas/bancos", label: "Banca", icon: Landmark, subKey: "contabilidad" },
    { key: "finance-contabilidad", href: "/finanzas/contabilidad", label: "Contab.", icon: BookText, subKey: "contabilidad" },
    { key: "finance-informes", href: "/finanzas/reportes", label: "Informes", icon: BarChart3, subKey: "reportes" },
  ];

/* ── Config sub-items (top 5 for bottom nav) ── */

const CONFIG_ITEMS: (BottomNavItem & { subKey: string })[] = [
  { key: "config-users", href: "/opai/configuracion/usuarios", label: "Usuarios", icon: Users, subKey: "usuarios" },
  { key: "config-groups", href: "/opai/configuracion/grupos", label: "Grupos", icon: Users, subKey: "grupos" },
  { key: "config-integrations", href: "/opai/configuracion/integraciones", label: "Integraciones", icon: Plug, subKey: "integraciones" },
  { key: "config-notifications", href: "/opai/configuracion/notificaciones", label: "Alertas", icon: Bell, subKey: "notificaciones" },
  { key: "config-crm", href: "/opai/configuracion/crm", label: "CRM", icon: TrendingUp, subKey: "crm" },
  { key: "config-cpq", href: "/opai/configuracion/cpq", label: "CPQ", icon: DollarSign, subKey: "cpq" },
  { key: "config-ops", href: "/opai/configuracion/ops", label: "Ops", icon: ClipboardList, subKey: "ops" },
  { key: "config-ticket-types", href: "/opai/configuracion/tipos-ticket", label: "Tickets", icon: Ticket, subKey: "tipos_ticket" },
  { key: "config-ia", href: "/opai/configuracion/inteligencia-artificial", label: "IA", icon: Sparkles, subKey: "inteligencia_artificial" },
];

/* ── Module detection ── */

interface ModuleDetection {
  test: (path: string) => boolean;
  getItems: (perms: RolePermissions) => BottomNavItem[];
}

const MODULE_DETECTIONS: ModuleDetection[] = [
  {
    test: (p) => p === "/crm" || p.startsWith("/crm/"),
    getItems: (perms) =>
      CRM_ITEMS.filter((item) => canView(perms, "crm", item.subKey)),
  },
  {
    test: (p) => p === "/ops" || p.startsWith("/ops/"),
    getItems: (perms) =>
      OPS_ITEMS.filter((item) => {
        if (item.subKey === "pautas") {
          return (
            canView(perms, "ops", "pauta_mensual") ||
            canView(perms, "ops", "pauta_diaria") ||
            canView(perms, "ops", "turnos_extra") ||
            canView(perms, "ops", "ppc")
          );
        }
        return canView(perms, "ops", item.subKey);
      }),
  },
  {
    test: (p) => p === "/te" || p.startsWith("/te/"),
    getItems: () => TE_ITEMS,
  },
  {
    test: (p) => p === "/personas" || p.startsWith("/personas/"),
    getItems: () => PERSONAS_ITEMS,
  },
  {
    test: (p) => p === "/payroll" || p.startsWith("/payroll/"),
    getItems: () => PAYROLL_ITEMS,
  },
  {
    test: (p) =>
      p.startsWith("/opai/inicio") ||
      p.startsWith("/opai/documentos") ||
      p.startsWith("/opai/templates"),
    getItems: () => DOCS_ITEMS,
  },
  {
    test: (p) => p === "/finanzas" || p.startsWith("/finanzas/"),
    getItems: (perms) =>
      FINANCE_ITEMS.filter((item) => {
        if (!canView(perms, "finance", item.subKey)) return false;
        return true;
      }),
  },
  {
    test: (p) => p.startsWith("/opai/configuracion"),
    getItems: (perms) =>
      CONFIG_ITEMS.filter((item) =>
        canView(perms, "config", item.subKey)
      ),
  },
];

/**
 * Devuelve los items del bottom nav según la ruta actual y el rol del usuario.
 *
 * - Dentro de un módulo: muestra subcategorías del módulo
 * - En ruta general: muestra navegación principal
 *
 * Nota: las páginas de detalle CRM ya no muestran bottom nav de secciones;
 * la navegación se hace via ChipTabs inline en la vista.
 *
 * Acepta un role string (usa defaults) o un RolePermissions object.
 */
export function getBottomNavItems(
  pathname: string,
  roleOrPerms: string | RolePermissions,
): BottomNavItem[] {
  const perms: RolePermissions =
    typeof roleOrPerms === "string"
      ? getDefaultPermissions(roleOrPerms)
      : roleOrPerms;

  // Páginas de detalle: no mostramos bottom nav. La navegación de secciones se
  // hace con ChipTabs inline y el usuario vuelve al listado con breadcrumbs/back.
  const DETAIL_PATTERNS = [
    /^\/crm\/(leads|accounts|contacts|deals|installations|cotizaciones)\/[^/]+$/,
    /^\/personas\/guardias\/[^/]+$/,
    /^\/payroll\/periodos\/[^/]+$/,
    /^\/finanzas\/rendiciones\/[^/]+$/,
    /^\/ops\/(tickets|control-nocturno)\/[^/]+$/,
    /^\/ops\/inventario\/productos\/[^/]+$/,
    /^\/opai\/documentos\/(templates\/)?[^/]+$/,
  ];
  if (DETAIL_PATTERNS.some((re) => re.test(pathname))) return [];

  // Prioridad 1: módulos → subcategorías
  for (const detection of MODULE_DETECTIONS) {
    if (detection.test(pathname)) {
      const items = detection.getItems(perms);
      if (items.length > 0) return items;
    }
  }

  // Default: main nav items
  const moduleMapping: Record<string, "hub" | "docs" | "crm" | "payroll" | "ops" | "config" | "finance"> = {
    hub: "hub",
    docs: "docs",
    crm: "crm",
    payroll: "payroll",
    ops: "ops",
    finance: "finance",
    admin: "config",
  };

  return MAIN_ITEMS.filter((item) => {
    const moduleKey = moduleMapping[item.app];
    if (!moduleKey) return false;
    return hasModuleAccess(perms, moduleKey);
  });
}

/* ── Exports para SubNav components ── */

export const OPS_SUBNAV_ITEMS = OPS_ITEMS;
export const TE_SUBNAV_ITEMS = TE_ITEMS;
export const PERSONAS_SUBNAV_ITEMS = PERSONAS_ITEMS;
export const PAYROLL_SUBNAV_ITEMS = PAYROLL_ITEMS;
export const DOCS_SUBNAV_ITEMS = DOCS_ITEMS;
