/**
 * Module Access - Visibilidad por submódulo según rol.
 *
 * Complementa App Access (módulo principal) con reglas finas para:
 * - CRM (submódulos)
 * - Configuración (submódulos)
 * - Docs (incluye editor de texto/templates)
 */

import { hasAppAccess } from "./app-access";
import {
  ROLE_POLICIES,
  type ConfigSubmoduleKey,
  type CrmSubmoduleKey,
  type DocsSubmoduleKey,
  type Role,
} from "./role-policy";

export type { ConfigSubmoduleKey, CrmSubmoduleKey, DocsSubmoduleKey };

export interface SubmoduleNavItem<K extends string> {
  key: K;
  href: string;
  label: string;
}

export const CRM_SUBMODULE_NAV_ITEMS: SubmoduleNavItem<CrmSubmoduleKey>[] = [
  { key: "leads", href: "/crm/leads", label: "Leads" },
  { key: "accounts", href: "/crm/accounts", label: "Cuentas" },
  { key: "installations", href: "/crm/installations", label: "Instalaciones" },
  { key: "contacts", href: "/crm/contacts", label: "Contactos" },
  { key: "deals", href: "/crm/deals", label: "Negocios" },
  { key: "quotes", href: "/crm/cotizaciones", label: "Cotizaciones" },
];

export const CONFIG_SUBMODULE_NAV_ITEMS: SubmoduleNavItem<ConfigSubmoduleKey>[] = [
  { key: "users", href: "/opai/configuracion/usuarios", label: "Usuarios" },
  { key: "integrations", href: "/opai/configuracion/integraciones", label: "Integraciones" },
  { key: "signatures", href: "/opai/configuracion/firmas", label: "Firmas" },
  { key: "doc_categories", href: "/opai/configuracion/categorias-plantillas", label: "Categorías plantillas" },
  { key: "crm", href: "/opai/configuracion/crm", label: "CRM" },
  { key: "cpq", href: "/opai/configuracion/cpq", label: "Configuración CPQ" },
  { key: "payroll", href: "/opai/configuracion/payroll", label: "Payroll" },
  { key: "notifications", href: "/opai/configuracion/notificaciones", label: "Notificaciones" },
  { key: "ops", href: "/opai/configuracion/ops", label: "Operaciones" },
];

const ROLE_CRM_SUBMODULE_ACCESS: Record<Role, CrmSubmoduleKey[]> = {
  owner: ROLE_POLICIES.owner.crmSubmodules,
  admin: ROLE_POLICIES.admin.crmSubmodules,
  editor: ROLE_POLICIES.editor.crmSubmodules,
  rrhh: ROLE_POLICIES.rrhh.crmSubmodules,
  operaciones: ROLE_POLICIES.operaciones.crmSubmodules,
  finanzas: ROLE_POLICIES.finanzas.crmSubmodules,
  reclutamiento: ROLE_POLICIES.reclutamiento.crmSubmodules,
  solo_ops: ROLE_POLICIES.solo_ops.crmSubmodules,
  solo_crm: ROLE_POLICIES.solo_crm.crmSubmodules,
  solo_documentos: ROLE_POLICIES.solo_documentos.crmSubmodules,
  solo_payroll: ROLE_POLICIES.solo_payroll.crmSubmodules,
  solo_finanzas: ROLE_POLICIES.solo_finanzas.crmSubmodules,
  supervisor: ROLE_POLICIES.supervisor.crmSubmodules,
  viewer: ROLE_POLICIES.viewer.crmSubmodules,
};

const ROLE_CONFIG_SUBMODULE_ACCESS: Record<Role, ConfigSubmoduleKey[]> = {
  owner: ROLE_POLICIES.owner.configSubmodules,
  admin: ROLE_POLICIES.admin.configSubmodules,
  editor: ROLE_POLICIES.editor.configSubmodules,
  rrhh: ROLE_POLICIES.rrhh.configSubmodules,
  operaciones: ROLE_POLICIES.operaciones.configSubmodules,
  finanzas: ROLE_POLICIES.finanzas.configSubmodules,
  reclutamiento: ROLE_POLICIES.reclutamiento.configSubmodules,
  solo_ops: ROLE_POLICIES.solo_ops.configSubmodules,
  solo_crm: ROLE_POLICIES.solo_crm.configSubmodules,
  solo_documentos: ROLE_POLICIES.solo_documentos.configSubmodules,
  solo_payroll: ROLE_POLICIES.solo_payroll.configSubmodules,
  solo_finanzas: ROLE_POLICIES.solo_finanzas.configSubmodules,
  supervisor: ROLE_POLICIES.supervisor.configSubmodules,
  viewer: ROLE_POLICIES.viewer.configSubmodules,
};

const ROLE_DOCS_SUBMODULE_ACCESS: Record<Role, DocsSubmoduleKey[]> = {
  owner: ROLE_POLICIES.owner.docsSubmodules,
  admin: ROLE_POLICIES.admin.docsSubmodules,
  editor: ROLE_POLICIES.editor.docsSubmodules,
  rrhh: ROLE_POLICIES.rrhh.docsSubmodules,
  operaciones: ROLE_POLICIES.operaciones.docsSubmodules,
  finanzas: ROLE_POLICIES.finanzas.docsSubmodules,
  reclutamiento: ROLE_POLICIES.reclutamiento.docsSubmodules,
  solo_ops: ROLE_POLICIES.solo_ops.docsSubmodules,
  solo_crm: ROLE_POLICIES.solo_crm.docsSubmodules,
  solo_documentos: ROLE_POLICIES.solo_documentos.docsSubmodules,
  solo_payroll: ROLE_POLICIES.solo_payroll.docsSubmodules,
  solo_finanzas: ROLE_POLICIES.solo_finanzas.docsSubmodules,
  supervisor: ROLE_POLICIES.supervisor.docsSubmodules,
  viewer: ROLE_POLICIES.viewer.docsSubmodules,
};

function hasRoleSubmoduleAccess<K extends string>(
  role: string,
  matrix: Record<Role, K[]>,
  key: K
): boolean {
  if (!(role in matrix)) {
    return false;
  }

  return matrix[role as Role].includes(key);
}

export function hasCrmSubmoduleAccess(role: string, key: CrmSubmoduleKey): boolean {
  if (!hasAppAccess(role, "crm")) {
    return false;
  }

  return hasRoleSubmoduleAccess(role, ROLE_CRM_SUBMODULE_ACCESS, key);
}

export function hasConfigSubmoduleAccess(role: string, key: ConfigSubmoduleKey): boolean {
  if (!hasAppAccess(role, "admin")) {
    return false;
  }

  return hasRoleSubmoduleAccess(role, ROLE_CONFIG_SUBMODULE_ACCESS, key);
}

export function hasDocsSubmoduleAccess(role: string, key: DocsSubmoduleKey): boolean {
  if (!hasAppAccess(role, "docs")) {
    return false;
  }

  return hasRoleSubmoduleAccess(role, ROLE_DOCS_SUBMODULE_ACCESS, key);
}

export function getVisibleCrmNavItems(role: string): SubmoduleNavItem<CrmSubmoduleKey>[] {
  return CRM_SUBMODULE_NAV_ITEMS.filter((item) => hasCrmSubmoduleAccess(role, item.key));
}

export function getVisibleConfigNavItems(
  role: string
): SubmoduleNavItem<ConfigSubmoduleKey>[] {
  return CONFIG_SUBMODULE_NAV_ITEMS.filter((item) =>
    hasConfigSubmoduleAccess(role, item.key)
  );
}

export function hasAnyConfigSubmoduleAccess(role: string): boolean {
  return getVisibleConfigNavItems(role).length > 0;
}
