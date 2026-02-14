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
  | "dotacion"
  | "marcacion"
  | "marcacion_asistencia"
  | "marcacion_rondas"
  | "asignacion"
  | "rondas"
  | "datos"
  | "documentos"
  | "docs-vinculados"
  | "eventos-laborales"
  | "cuentas"
  | "comentarios"
  | "dias-trabajados"
  | "turnos-extra"
  | "rendiciones"
  | "historial"
  | "files";

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
    color: "text-emerald-500 bg-emerald-500/10",
    textColor: "text-emerald-500",
    bgColor: "bg-emerald-500/10",
  },
  accounts: {
    key: "accounts",
    icon: Building2,
    label: "Cuenta",
    labelPlural: "Cuentas",
    color: "text-blue-500 bg-blue-500/10",
    textColor: "text-blue-500",
    bgColor: "bg-blue-500/10",
  },
  installations: {
    key: "installations",
    icon: MapPin,
    label: "Instalación",
    labelPlural: "Instalaciones",
    color: "text-teal-500 bg-teal-500/10",
    textColor: "text-teal-500",
    bgColor: "bg-teal-500/10",
  },
  contacts: {
    key: "contacts",
    icon: UserCircle,
    label: "Contacto",
    labelPlural: "Contactos",
    color: "text-sky-500 bg-sky-500/10",
    textColor: "text-sky-500",
    bgColor: "bg-sky-500/10",
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
    color: "text-amber-500 bg-amber-500/10",
    textColor: "text-amber-500",
    bgColor: "bg-amber-500/10",
  },
  guardias: {
    key: "guardias",
    icon: Shield,
    label: "Guardia",
    labelPlural: "Guardias",
    color: "text-indigo-500 bg-indigo-500/10",
    textColor: "text-indigo-500",
    bgColor: "bg-indigo-500/10",
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
  "eventos-laborales": {
    key: "eventos-laborales",
    icon: Gavel,
    label: "Eventos laborales",
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
  contacts: ["general", "account", "deals", "communication", "notes"],
  deals: ["general", "account", "contacts", "installations", "quotes", "followup", "communication", "notes"],
  installations: ["general", "account", "staffing", "dotacion", "marcacion_asistencia", "marcacion_rondas", "rendiciones", "quotes", "communication", "notes"],
  guardias: ["datos", "eventos-laborales", "asignacion", "marcacion", "rondas", "documentos", "docs-vinculados", "cuentas", "communication", "comentarios", "dias-trabajados", "turnos-extra", "rendiciones", "historial"],
};
