/**
 * CRM Module Icons & Colors — Mapeo centralizado
 *
 * Fuente única de verdad para iconos, colores y labels de cada módulo/sección CRM.
 * Se usa en: CrmSubnav, página principal CRM, listas, detalles, empty states, breadcrumbs.
 */

import {
  Users,
  Building2,
  MapPin,
  TrendingUp,
  UserCircle,
  DollarSign,
  FileText,
  Gavel,
  Mail,
  Landmark,
  CalendarDays,
  CalendarPlus,
  History,
  Link2,
  MessageSquareText,
  Clock3,
  Info,
  Shield,
  QrCode,
  Receipt,
  Shirt,
  type LucideIcon,
} from "lucide-react";

/* ── Tipos ── */

export type CrmModuleKey =
  | "leads"
  | "accounts"
  | "installations"
  | "contacts"
  | "deals"
  | "quotes"
  | "guardias"
  | "reports";

export type CrmSectionKey =
  | "general"
  | "account"
  | "contacts"
  | "installations"
  | "deals"
  | "quotes"
  | "followup"
  | "communication"
  | "notes"
  | "staffing"
  | "refuerzos"
  | "dotacion"
  | "marcacion"
  | "marcacion_asistencia"
  | "marcacion_rondas"
  | "asignacion"
  | "rondas"
  | "datos"
  | "documentos"
  | "docs-vinculados"
  | "contratos"
  | "eventos-laborales"
  | "estructura-sueldo"
  | "liquidaciones"
  | "cuentas"
  | "comentarios"
  | "dias-trabajados"
  | "turnos-extra"
  | "rendiciones"
  | "historial"
  | "files"
  | "uniformes"
  | "uniformes-activos";

export interface ModuleConfig {
  key: CrmModuleKey;
  icon: LucideIcon;
  label: string;
  labelPlural: string;
  /** Tailwind color classes: text + bg combo */
  color: string;
  /** Solo el text color para usar standalone */
  textColor: string;
  /** Solo el bg color para usar standalone */
  bgColor: string;
}

export interface SectionConfig {
  key: CrmSectionKey;
  icon: LucideIcon;
  label: string;
}

/* ── Módulos CRM ── */

export const CRM_MODULES: Record<CrmModuleKey, ModuleConfig> = {
  leads: {
    key: "leads",
    icon: Users,
    label: "Lead",
    labelPlural: "Leads",
    color: "text-status-ok-fg bg-status-ok-soft",
    textColor: "text-status-ok-fg",
    bgColor: "bg-status-ok-soft",
  },
  accounts: {
    key: "accounts",
    icon: Building2,
    label: "Cuenta",
    labelPlural: "Cuentas",
    color: "text-status-info-fg bg-status-info-soft",
    textColor: "text-status-info-fg",
    bgColor: "bg-status-info-soft",
  },
  installations: {
    key: "installations",
    icon: MapPin,
    label: "Instalación",
    labelPlural: "Instalaciones",
    color: "text-status-info-fg bg-status-info-soft",
    textColor: "text-status-info-fg",
    bgColor: "bg-status-info-soft",
  },
  contacts: {
    key: "contacts",
    icon: UserCircle,
    label: "Contacto",
    labelPlural: "Contactos",
    color: "text-status-info-fg bg-status-info-soft",
    textColor: "text-status-info-fg",
    bgColor: "bg-status-info-soft",
  },
  deals: {
    key: "deals",
    icon: TrendingUp,
    label: "Negocio",
    labelPlural: "Negocios",
    color: "text-purple-500 bg-purple-500/10",
    textColor: "text-purple-500",
    bgColor: "bg-purple-500/10",
  },
  quotes: {
    key: "quotes",
    icon: DollarSign,
    label: "Cotización",
    labelPlural: "Cotizaciones",
    color: "text-status-warn-fg bg-status-warn-soft",
    textColor: "text-status-warn-fg",
    bgColor: "bg-status-warn-soft",
  },
  guardias: {
    key: "guardias",
    icon: Shield,
    label: "Guardia",
    labelPlural: "Guardias",
    color: "text-status-info-fg bg-status-info-soft",
    textColor: "text-status-info-fg",
    bgColor: "bg-status-info-soft",
  },
  reports: {
    key: "reports",
    icon: FileText,
    label: "Reporte",
    labelPlural: "Reportes",
    color: "text-muted-foreground bg-muted",
    textColor: "text-muted-foreground",
    bgColor: "bg-muted",
  },
};

/* ── Secciones de detalle ── */

export const CRM_SECTIONS: Record<CrmSectionKey, SectionConfig> = {
  general: {
    key: "general",
    icon: Info,
    label: "Datos generales",
  },
  account: {
    key: "account",
    icon: Building2,
    label: "Cuenta",
  },
  contacts: {
    key: "contacts",
    icon: UserCircle,
    label: "Contactos",
  },
  installations: {
    key: "installations",
    icon: MapPin,
    label: "Instalaciones",
  },
  deals: {
    key: "deals",
    icon: TrendingUp,
    label: "Negocios",
  },
  quotes: {
    key: "quotes",
    icon: DollarSign,
    label: "Cotizaciones",
  },
  followup: {
    key: "followup",
    icon: Clock3,
    label: "Seguimiento",
  },
  communication: {
    key: "communication",
    icon: Mail,
    label: "Comunicación",
  },
  notes: {
    key: "notes",
    icon: MessageSquareText,
    label: "Notas",
  },
  staffing: {
    key: "staffing",
    icon: Shield,
    label: "Puestos operativos",
  },
  refuerzos: {
    key: "refuerzos",
    icon: CalendarPlus,
    label: "Turnos de refuerzo",
  },
  dotacion: {
    key: "dotacion",
    icon: Users,
    label: "Dotación activa",
  },
  marcacion: {
    key: "marcacion",
    icon: QrCode,
    label: "Marcación asistencia",
  },
  marcacion_asistencia: {
    key: "marcacion_asistencia",
    icon: QrCode,
    label: "Marcación asistencia",
  },
  marcacion_rondas: {
    key: "marcacion_rondas",
    icon: QrCode,
    label: "Marcación rondas",
  },
  asignacion: {
    key: "asignacion",
    icon: MapPin,
    label: "Asignación",
  },
  rondas: {
    key: "rondas",
    icon: QrCode,
    label: "Rondas",
  },
  datos: {
    key: "datos",
    icon: Info,
    label: "Datos",
  },
  documentos: {
    key: "documentos",
    icon: FileText,
    label: "Documentos",
  },
  "docs-vinculados": {
    key: "docs-vinculados",
    icon: Link2,
    label: "Docs vinculados",
  },
  contratos: {
    key: "contratos",
    icon: FileText,
    label: "Contratos",
  },
  "eventos-laborales": {
    key: "eventos-laborales",
    icon: Gavel,
    label: "Eventos laborales",
  },
  "estructura-sueldo": {
    key: "estructura-sueldo",
    icon: Receipt,
    label: "Estructura de sueldo",
  },
  liquidaciones: {
    key: "liquidaciones",
    icon: Receipt,
    label: "Liquidaciones",
  },
  cuentas: {
    key: "cuentas",
    icon: Landmark,
    label: "Cuenta bancaria",
  },
  comentarios: {
    key: "comentarios",
    icon: MessageSquareText,
    label: "Comentarios",
  },
  "dias-trabajados": {
    key: "dias-trabajados",
    icon: CalendarDays,
    label: "Días trabajados",
  },
  "turnos-extra": {
    key: "turnos-extra",
    icon: CalendarPlus,
    label: "Turnos extra",
  },
  rendiciones: {
    key: "rendiciones",
    icon: Receipt,
    label: "Rendiciones de gastos",
  },
  historial: {
    key: "historial",
    icon: History,
    label: "Historial",
  },
  files: {
    key: "files",
    icon: FileText,
    label: "Archivos",
  },
  uniformes: {
    key: "uniformes",
    icon: Shirt,
    label: "Uniformes asignados",
  },
  "uniformes-activos": {
    key: "uniformes-activos",
    icon: Shirt,
    label: "Uniformes y activos",
  },
};

/* ── Helpers ── */

/** Obtiene la config de un módulo CRM por key */
export function getCrmModule(key: CrmModuleKey): ModuleConfig {
  return CRM_MODULES[key];
}

/** Obtiene la config de una sección de detalle por key */
export function getCrmSection(key: CrmSectionKey): SectionConfig {
  return CRM_SECTIONS[key];
}

/**
 * Mapeo de CrmSubmoduleKey (del sistema de acceso) a CrmModuleKey (iconos).
 * Útil para conectar el nav con los iconos.
 */
export const SUBMODULE_TO_MODULE: Record<string, CrmModuleKey> = {
  leads: "leads",
  accounts: "accounts",
  installations: "installations",
  contacts: "contacts",
  deals: "deals",
  quotes: "quotes",
  prospecting: "leads",
};

/**
 * Orden estandarizado de secciones para vistas de detalle.
 * Cada módulo muestra las que le aplican, pero siempre en este orden.
 */
export const DETAIL_SECTION_ORDER: CrmSectionKey[] = [
  "general",
  "account",
  "contacts",
  "installations",
  "deals",
  "quotes",
  "staffing",
  "dotacion",
  "followup",
  "communication",
  "notes",
];

/**
 * Secciones visibles por módulo de detalle.
 */
export const MODULE_DETAIL_SECTIONS: Record<string, CrmSectionKey[]> = {
  leads: ["general", "account", "contacts", "deals", "installations", "files"],
  accounts: ["general", "contacts", "installations", "deals", "quotes", "rendiciones", "communication", "notes"],
  contacts: ["general", "account", "installations", "deals", "quotes", "communication", "notes", "files"],
  deals: ["general", "account", "contacts", "installations", "quotes", "followup", "communication", "notes"],
  installations: ["general", "account", "contacts", "deals", "quotes", "staffing", "refuerzos", "dotacion", "marcacion_asistencia", "marcacion_rondas", "rendiciones", "uniformes-activos", "notes", "files"],
  guardias: ["datos", "contratos", "eventos-laborales", "estructura-sueldo", "liquidaciones", "asignacion", "marcacion", "rondas", "documentos", "docs-vinculados", "cuentas", "communication", "comentarios", "dias-trabajados", "turnos-extra", "rendiciones", "historial", "uniformes"],
};
