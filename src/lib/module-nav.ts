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
  // Main nav
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
  // CRM
  Users,
  MapPin,
  TrendingUp,
  Contact,
  DollarSign,
  // Ops
  CalendarDays,
  UserRoundCheck,
  ShieldAlert,
  Fingerprint,
  Route,
  Radio,
  Moon,
  Ticket,
  // TE
  CheckCircle2,
  Layers,
  Banknote,
  // Personas
  Shield,
  // Docs
  FolderOpen,
  // Config
  Plug,
  Bell,
} from "lucide-react";
import {
  CRM_SECTIONS,
  MODULE_DETAIL_SECTIONS,
} from "@/components/crm/CrmModuleIcons";
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
  { key: "docs", href: "/opai/inicio", label: "Docs", icon: FileText, app: "docs" },
  { key: "crm", href: "/crm", label: "CRM", icon: Building2, app: "crm" },
  { key: "payroll", href: "/payroll", label: "Payroll", icon: Calculator, app: "payroll" },
  { key: "ops", href: "/ops", label: "Ops", icon: ClipboardList, app: "ops" },
  { key: "finance", href: "/finanzas", label: "Finanzas", icon: Receipt, app: "finance" },
  { key: "config", href: "/opai/configuracion", label: "Config", icon: Settings, app: "admin" },
];

/* ── CRM sub-items ── */

const CRM_ITEMS: (BottomNavItem & { subKey: string })[] = [
  { key: "crm-leads", href: "/crm/leads", label: "Leads", icon: Users, subKey: "leads" },
  { key: "crm-accounts", href: "/crm/accounts", label: "Cuentas", icon: Building2, subKey: "accounts" },
  { key: "crm-installations", href: "/crm/installations", label: "Instalaciones", icon: MapPin, subKey: "installations" },
  { key: "crm-deals", href: "/crm/deals", label: "Negocios", icon: TrendingUp, subKey: "deals" },
  { key: "crm-contacts", href: "/crm/contacts", label: "Contactos", icon: Contact, subKey: "contacts" },
  { key: "crm-quotes", href: "/crm/cotizaciones", label: "Cotizaciones", icon: DollarSign, subKey: "quotes" },
];

/* ── Ops sub-items ── */

const OPS_ITEMS: (BottomNavItem & { subKey: string })[] = [
  { key: "ops-pauta-mensual", href: "/ops/pauta-mensual", label: "Mensual", icon: CalendarDays, subKey: "pauta_mensual" },
  { key: "ops-pauta-diaria", href: "/ops/pauta-diaria", label: "Diaria", icon: UserRoundCheck, subKey: "pauta_diaria" },
  { key: "ops-marcaciones", href: "/ops/marcaciones", label: "Marcaciones", icon: Fingerprint, subKey: "marcaciones" },
  { key: "ops-ppc", href: "/ops/ppc", label: "PPC", icon: ShieldAlert, subKey: "ppc" },
  { key: "ops-rondas", href: "/ops/rondas", label: "Rondas", icon: Route, subKey: "rondas" },
  { key: "ops-control-nocturno", href: "/ops/control-nocturno", label: "Nocturno", icon: Moon, subKey: "control_nocturno" },
  { key: "ops-tickets", href: "/ops/tickets", label: "Tickets", icon: Ticket, subKey: "tickets" },
];

const RONDAS_ITEMS: BottomNavItem[] = [
  { key: "rondas-dashboard", href: "/ops/rondas", label: "Dashboard", icon: ClipboardList },
  { key: "rondas-monitoreo", href: "/ops/rondas/monitoreo", label: "Monitor", icon: Radio },
  { key: "rondas-alertas", href: "/ops/rondas/alertas", label: "Alertas", icon: Bell },
  { key: "rondas-checkpoints", href: "/ops/rondas/checkpoints", label: "Puntos", icon: MapPin },
  { key: "rondas-config", href: "/ops/rondas/templates", label: "Config", icon: Settings },
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
  { key: "personas-guardias", href: "/personas/guardias", label: "Guardias", icon: Shield },
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
];

/* ── Module detection ── */

interface ModuleDetection {
  test: (path: string) => boolean;
  getItems: (perms: RolePermissions) => BottomNavItem[];
}

const MODULE_DETECTIONS: ModuleDetection[] = [
  {
    test: (p) => p.startsWith("/ops/rondas"),
    getItems: () => RONDAS_ITEMS,
  },
  {
    test: (p) => p === "/crm" || p.startsWith("/crm/"),
    getItems: (perms) =>
      CRM_ITEMS.filter((item) => canView(perms, "crm", item.subKey)),
  },
  {
    test: (p) => p === "/ops" || p.startsWith("/ops/"),
    getItems: (perms) =>
      OPS_ITEMS.filter((item) => canView(perms, "ops", item.subKey)),
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

/* ── CRM detail page → section items ── */

const CRM_MODULE_MAP: Record<string, string> = {
  leads: "leads",
  accounts: "accounts",
  contacts: "contacts",
  deals: "deals",
  installations: "installations",
  cotizaciones: "quotes",
};

/** Abreviaciones para el bottom nav (espacio limitado) */
const SECTION_SHORT_LABELS: Record<string, string> = {
  general: "Info",
  account: "Cuenta",
  contacts: "Contacto",
  deals: "Negocio",
  installations: "Instal.",
  quotes: "CPQ",
  followup: "Seguim.",
  communication: "Correos",
  notes: "Notas",
  staffing: "Puestos",
  dotacion: "Dotación",
  files: "Archivos",
};

/**
 * Detecta si el pathname es una página de detalle CRM (ej: /crm/leads/cm7xxx)
 * y devuelve los items de sección para la bottom nav.
 */
function getCrmDetailSectionItems(pathname: string): BottomNavItem[] | null {
  // Patrón: /crm/{module}/{id} donde id es un cuid (cm...) u otro identificador
  const match = pathname.match(
    /^\/crm\/(leads|accounts|contacts|deals|installations|cotizaciones)\/([^/]+)$/
  );
  if (!match) return null;

  const moduleKey = CRM_MODULE_MAP[match[1]];
  if (!moduleKey) return null;

  const sectionKeys = MODULE_DETAIL_SECTIONS[moduleKey];
  if (!sectionKeys || sectionKeys.length === 0) return null;

  return sectionKeys.map((key) => {
    const section = CRM_SECTIONS[key];
    return {
      key: `section-${key}`,
      href: `#section-${key}`,
      label: SECTION_SHORT_LABELS[key] || section.label,
      icon: section.icon,
      isSection: true,
    };
  });
}

/**
 * Devuelve los items del bottom nav según la ruta actual y el rol del usuario.
 *
 * - En detalle CRM: muestra secciones del registro (scroll a anclas)
 * - Dentro de un módulo: muestra subcategorías del módulo
 * - En ruta general: muestra navegación principal
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

  // Prioridad 1: páginas de detalle CRM → secciones del registro
  const sectionItems = getCrmDetailSectionItems(pathname);
  if (sectionItems) return sectionItems;

  // Prioridad 2: módulos → subcategorías
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
