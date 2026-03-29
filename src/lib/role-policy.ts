import { type AppKey } from "./app-keys";

export const ROLES = {
  // 7 Roles activos
  OWNER: "owner",
  ADMIN: "admin",
  EDITOR: "editor",
  JEFE_OPERACIONES: "jefe_operaciones",
  CENTRAL_MONITOREO: "central_monitoreo",
  SUPERVISOR: "supervisor",
  VIEWER: "viewer",
  // Legacy
  RRHH: "rrhh",
  OPERACIONES: "operaciones",
  FINANZAS: "finanzas",
  RECLUTAMIENTO: "reclutamiento",
  SOLO_OPS: "solo_ops",
  SOLO_CRM: "solo_crm",
  SOLO_DOCUMENTOS: "solo_documentos",
  SOLO_PAYROLL: "solo_payroll",
  INSPECTOR_DT: "inspector_dt",
} as const;

export type Role = typeof ROLES[keyof typeof ROLES];

export const PERMISSIONS = {
  MANAGE_USERS: "manage_users",
  INVITE_USERS: "invite_users",
  MANAGE_TEMPLATES: "manage_templates",
  EDIT_TEMPLATES: "edit_templates",
  VIEW_TEMPLATES: "view_templates",
  SEND_PRESENTATIONS: "send_presentations",
  CREATE_PRESENTATIONS: "create_presentations",
  VIEW_PRESENTATIONS: "view_presentations",
  VIEW_ANALYTICS: "view_analytics",
  MANAGE_SETTINGS: "manage_settings",
} as const;

export type Permission = typeof PERMISSIONS[keyof typeof PERMISSIONS];

export type CrmSubmoduleKey =
  | "overview"
  | "leads"
  | "accounts"
  | "installations"
  | "contacts"
  | "deals"
  | "quotes";

export type ConfigSubmoduleKey =
  | "overview"
  | "users"
  | "integrations"
  | "signatures"
  | "doc_categories"
  | "notifications"
  | "crm"
  | "cpq"
  | "payroll"
  | "ops"
  | "finanzas";

export type DocsSubmoduleKey =
  | "overview"
  | "documents"
  | "document_editor"
  | "templates"
  | "template_editor";

export type OpsCapability =
  | "guardias_manage"
  /** Editar instalación prevista y fecha probable (supervisor, jefe ops, reclutamiento, etc.) */
  | "guardias_plan_seleccion"
  | "guardias_documents"
  | "guardias_te_ingreso" // Ingreso rápido guardia Turno Extra (Supervisor, Admin, RRHH)
  | "ops_execution"
  | "te_execution"
  | "rrhh_events"
  | "rondas_configure"
  | "rondas_monitor"
  | "rondas_resolve"
  | "alerta_cobertura_crear"
  | "alerta_cobertura_gestionar"
  | "alerta_cobertura_config";

export interface RolePolicy {
  rank: number;
  appAccess: AppKey[];
  permissions: Permission[];
  crmSubmodules: CrmSubmoduleKey[];
  configSubmodules: ConfigSubmoduleKey[];
  docsSubmodules: DocsSubmoduleKey[];
  opsCapabilities: OpsCapability[];
}

const ALL_APPS: AppKey[] = ["hub", "docs", "crm", "cpq", "payroll", "ops", "finance", "portal", "admin"];
const ALL_CRM_SUBMODULES: CrmSubmoduleKey[] = [
  "overview",
  "leads",
  "accounts",
  "installations",
  "contacts",
  "deals",
  "quotes",
];
const ALL_CONFIG_SUBMODULES: ConfigSubmoduleKey[] = [
  "overview",
  "users",
  "integrations",
  "signatures",
  "doc_categories",
  "notifications",
  "crm",
  "cpq",
  "payroll",
  "ops",
  "finanzas",
];
const ALL_DOCS_SUBMODULES: DocsSubmoduleKey[] = [
  "overview",
  "documents",
  "document_editor",
  "templates",
  "template_editor",
];
const ALL_OPS_CAPABILITIES: OpsCapability[] = [
  "guardias_manage",
  "guardias_plan_seleccion",
  "guardias_documents",
  "guardias_te_ingreso",
  "ops_execution",
  "te_execution",
  "rrhh_events",
  "rondas_configure",
  "rondas_monitor",
  "rondas_resolve",
  "alerta_cobertura_crear",
  "alerta_cobertura_gestionar",
  "alerta_cobertura_config",
];

export const ROLE_POLICIES: Record<Role, RolePolicy> = {
  // ── 7 Roles activos ──

  owner: {
    rank: 4,
    appAccess: ALL_APPS,
    permissions: [
      PERMISSIONS.MANAGE_USERS, PERMISSIONS.INVITE_USERS,
      PERMISSIONS.MANAGE_TEMPLATES, PERMISSIONS.EDIT_TEMPLATES, PERMISSIONS.VIEW_TEMPLATES,
      PERMISSIONS.SEND_PRESENTATIONS, PERMISSIONS.CREATE_PRESENTATIONS, PERMISSIONS.VIEW_PRESENTATIONS,
      PERMISSIONS.VIEW_ANALYTICS, PERMISSIONS.MANAGE_SETTINGS,
    ],
    crmSubmodules: ALL_CRM_SUBMODULES,
    configSubmodules: ALL_CONFIG_SUBMODULES,
    docsSubmodules: ALL_DOCS_SUBMODULES,
    opsCapabilities: ALL_OPS_CAPABILITIES,
  },
  admin: {
    rank: 3,
    appAccess: ALL_APPS,
    permissions: [
      PERMISSIONS.MANAGE_USERS, PERMISSIONS.INVITE_USERS,
      PERMISSIONS.MANAGE_TEMPLATES, PERMISSIONS.EDIT_TEMPLATES, PERMISSIONS.VIEW_TEMPLATES,
      PERMISSIONS.SEND_PRESENTATIONS, PERMISSIONS.CREATE_PRESENTATIONS, PERMISSIONS.VIEW_PRESENTATIONS,
      PERMISSIONS.VIEW_ANALYTICS, PERMISSIONS.MANAGE_SETTINGS,
    ],
    crmSubmodules: ALL_CRM_SUBMODULES,
    configSubmodules: ALL_CONFIG_SUBMODULES,
    docsSubmodules: ALL_DOCS_SUBMODULES,
    opsCapabilities: ALL_OPS_CAPABILITIES,
  },
  editor: {
    rank: 2,
    appAccess: ["hub", "docs", "crm", "cpq", "ops", "finance", "payroll"],
    permissions: [
      PERMISSIONS.EDIT_TEMPLATES, PERMISSIONS.VIEW_TEMPLATES,
      PERMISSIONS.SEND_PRESENTATIONS, PERMISSIONS.CREATE_PRESENTATIONS, PERMISSIONS.VIEW_PRESENTATIONS,
      PERMISSIONS.VIEW_ANALYTICS,
    ],
    crmSubmodules: ALL_CRM_SUBMODULES,
    configSubmodules: [],
    docsSubmodules: ALL_DOCS_SUBMODULES,
    opsCapabilities: [
      "guardias_manage",
      "guardias_plan_seleccion",
      "guardias_documents",
      "ops_execution",
      "te_execution",
      "rondas_configure",
      "rondas_monitor",
      "rondas_resolve",
      "alerta_cobertura_crear",
      "alerta_cobertura_gestionar",
    ],
  },
  jefe_operaciones: {
    rank: 2,
    appAccess: ["hub", "ops", "crm", "finance"],
    permissions: [PERMISSIONS.VIEW_PRESENTATIONS],
    crmSubmodules: ["overview", "accounts", "installations", "contacts"],
    configSubmodules: [],
    docsSubmodules: [],
    opsCapabilities: [
      "guardias_manage",
      "guardias_plan_seleccion",
      "guardias_te_ingreso",
      "guardias_documents",
      "ops_execution",
      "te_execution",
      "rondas_configure",
      "rondas_monitor",
      "rondas_resolve",
      "alerta_cobertura_crear",
      "alerta_cobertura_gestionar",
    ],
  },
  central_monitoreo: {
    rank: 1,
    appAccess: ["hub", "ops"],
    permissions: [PERMISSIONS.VIEW_PRESENTATIONS],
    crmSubmodules: ["installations"],
    configSubmodules: [],
    docsSubmodules: [],
    opsCapabilities: ["rondas_monitor", "rondas_resolve", "alerta_cobertura_crear", "alerta_cobertura_gestionar"],
  },
  supervisor: {
    rank: 1,
    appAccess: ["hub", "ops", "crm", "finance"],
    permissions: [PERMISSIONS.VIEW_PRESENTATIONS],
    crmSubmodules: ["accounts", "installations", "contacts"],
    configSubmodules: [],
    docsSubmodules: [],
    opsCapabilities: ["guardias_plan_seleccion", "guardias_te_ingreso", "ops_execution", "rondas_monitor", "alerta_cobertura_crear", "alerta_cobertura_gestionar"],
  },
  viewer: {
    rank: 0,
    appAccess: ["hub", "ops", "crm", "docs"],
    permissions: [PERMISSIONS.VIEW_TEMPLATES, PERMISSIONS.VIEW_PRESENTATIONS],
    crmSubmodules: ALL_CRM_SUBMODULES,
    configSubmodules: [],
    docsSubmodules: ["overview", "documents", "templates"],
    opsCapabilities: [],
  },

  // ── Legacy (mantener por retrocompatibilidad) ──

  rrhh: {
    rank: 2,
    appAccess: ["hub", "ops"],
    permissions: [PERMISSIONS.VIEW_PRESENTATIONS],
    crmSubmodules: [],
    configSubmodules: [],
    docsSubmodules: [],
    opsCapabilities: [
      "guardias_manage",
      "guardias_plan_seleccion",
      "guardias_documents",
      "guardias_te_ingreso",
      "rrhh_events",
      "rondas_monitor",
    ],
  },
  operaciones: {
    rank: 2,
    appAccess: ["hub", "ops"],
    permissions: [PERMISSIONS.VIEW_PRESENTATIONS],
    crmSubmodules: [],
    configSubmodules: [],
    docsSubmodules: [],
    opsCapabilities: ["guardias_documents", "ops_execution", "te_execution", "rondas_configure", "rondas_monitor", "rondas_resolve"],
  },
  finanzas: {
    rank: 2,
    appAccess: ["hub", "finance"],
    permissions: [PERMISSIONS.VIEW_PRESENTATIONS],
    crmSubmodules: [],
    configSubmodules: [],
    docsSubmodules: [],
    opsCapabilities: [],
  },
  reclutamiento: {
    rank: 2,
    appAccess: ["hub", "ops"],
    permissions: [PERMISSIONS.VIEW_PRESENTATIONS],
    crmSubmodules: [],
    configSubmodules: [],
    docsSubmodules: [],
    opsCapabilities: ["guardias_manage", "guardias_plan_seleccion", "guardias_documents"],
  },
  solo_ops: {
    rank: 1,
    appAccess: ["hub", "ops"],
    permissions: [],
    crmSubmodules: [],
    configSubmodules: [],
    docsSubmodules: [],
    opsCapabilities: ["guardias_documents", "ops_execution", "te_execution", "rondas_monitor"],
  },
  solo_crm: {
    rank: 1,
    appAccess: ["hub", "crm"],
    permissions: [],
    crmSubmodules: ALL_CRM_SUBMODULES,
    configSubmodules: [],
    docsSubmodules: [],
    opsCapabilities: [],
  },
  solo_documentos: {
    rank: 1,
    appAccess: ["hub", "docs"],
    permissions: [PERMISSIONS.VIEW_TEMPLATES, PERMISSIONS.VIEW_PRESENTATIONS],
    crmSubmodules: [],
    configSubmodules: [],
    docsSubmodules: ["overview", "documents", "templates"],
    opsCapabilities: [],
  },
  solo_payroll: {
    rank: 1,
    appAccess: ["hub", "payroll"],
    permissions: [],
    crmSubmodules: [],
    configSubmodules: [],
    docsSubmodules: [],
    opsCapabilities: [],
  },
  inspector_dt: {
    rank: 0,
    appAccess: [],
    permissions: [],
    crmSubmodules: [],
    configSubmodules: [],
    docsSubmodules: [],
    opsCapabilities: [],
  },
};
