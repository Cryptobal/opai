import { type AppKey } from "./app-keys";

export const ROLES = {
  OWNER: "owner",
  ADMIN: "admin",
  EDITOR: "editor",
  RRHH: "rrhh",
  OPERACIONES: "operaciones",
  RECLUTAMIENTO: "reclutamiento",
  SOLO_OPS: "solo_ops",
  SOLO_CRM: "solo_crm",
  SOLO_DOCUMENTOS: "solo_documentos",
  SOLO_PAYROLL: "solo_payroll",
  VIEWER: "viewer",
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
  | "ops";

export type DocsSubmoduleKey =
  | "overview"
  | "documents"
  | "document_editor"
  | "templates"
  | "template_editor";

export type OpsCapability =
  | "guardias_manage"
  | "guardias_blacklist"
  | "guardias_documents"
  | "ops_execution"
  | "te_execution"
  | "rrhh_events"
  | "rondas_configure"
  | "rondas_monitor"
  | "rondas_resolve";

export interface RolePolicy {
  rank: number;
  appAccess: AppKey[];
  permissions: Permission[];
  crmSubmodules: CrmSubmoduleKey[];
  configSubmodules: ConfigSubmoduleKey[];
  docsSubmodules: DocsSubmoduleKey[];
  opsCapabilities: OpsCapability[];
}

const ALL_APPS: AppKey[] = ["hub", "docs", "crm", "cpq", "payroll", "ops", "portal", "admin"];
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
  "guardias_blacklist",
  "guardias_documents",
  "ops_execution",
  "te_execution",
  "rrhh_events",
  "rondas_configure",
  "rondas_monitor",
  "rondas_resolve",
];

export const ROLE_POLICIES: Record<Role, RolePolicy> = {
  owner: {
    rank: 4,
    appAccess: ALL_APPS,
    permissions: [
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
    crmSubmodules: ALL_CRM_SUBMODULES,
    configSubmodules: ALL_CONFIG_SUBMODULES,
    docsSubmodules: ALL_DOCS_SUBMODULES,
    opsCapabilities: ALL_OPS_CAPABILITIES,
  },
  admin: {
    rank: 3,
    appAccess: ALL_APPS,
    permissions: [
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
    crmSubmodules: ALL_CRM_SUBMODULES,
    configSubmodules: ALL_CONFIG_SUBMODULES,
    docsSubmodules: ALL_DOCS_SUBMODULES,
    opsCapabilities: ALL_OPS_CAPABILITIES,
  },
  editor: {
    rank: 2,
    appAccess: ["hub", "docs", "crm", "cpq", "payroll", "ops"],
    permissions: [
      PERMISSIONS.EDIT_TEMPLATES,
      PERMISSIONS.VIEW_TEMPLATES,
      PERMISSIONS.SEND_PRESENTATIONS,
      PERMISSIONS.CREATE_PRESENTATIONS,
      PERMISSIONS.VIEW_PRESENTATIONS,
      PERMISSIONS.VIEW_ANALYTICS,
    ],
    crmSubmodules: ALL_CRM_SUBMODULES,
    configSubmodules: [],
    docsSubmodules: ALL_DOCS_SUBMODULES,
    opsCapabilities: [
      "guardias_manage",
      "guardias_documents",
      "ops_execution",
      "te_execution",
      "rondas_monitor",
      "rondas_resolve",
    ],
  },
  rrhh: {
    rank: 2,
    appAccess: ["hub", "ops"],
    permissions: [PERMISSIONS.VIEW_PRESENTATIONS],
    crmSubmodules: [],
    configSubmodules: [],
    docsSubmodules: [],
    opsCapabilities: [
      "guardias_manage",
      "guardias_blacklist",
      "guardias_documents",
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
    opsCapabilities: [
      "guardias_documents",
      "ops_execution",
      "te_execution",
      "rondas_configure",
      "rondas_monitor",
      "rondas_resolve",
    ],
  },
  reclutamiento: {
    rank: 2,
    appAccess: ["hub", "ops"],
    permissions: [PERMISSIONS.VIEW_PRESENTATIONS],
    crmSubmodules: [],
    configSubmodules: [],
    docsSubmodules: [],
    opsCapabilities: ["guardias_manage", "guardias_documents"],
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
  viewer: {
    rank: 1,
    appAccess: ["hub", "docs"],
    permissions: [PERMISSIONS.VIEW_TEMPLATES, PERMISSIONS.VIEW_PRESENTATIONS],
    crmSubmodules: [],
    configSubmodules: [],
    docsSubmodules: ["overview", "documents", "templates"],
    opsCapabilities: [],
  },
};
