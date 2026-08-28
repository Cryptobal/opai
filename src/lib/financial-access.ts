/**
 * Blindaje financiero — invariante de autorización.
 *
 * Owner y admin son los únicos perfiles que pueden ver cifras de la empresa
 * (banca, flujo, facturación, contabilidad, reportes, CPQ, negocios, payroll).
 * Un RoleTemplate no puede reabrir estas superficies: el lock corre DESPUÉS
 * del merge de template en `resolvePermissions`.
 *
 * Rendiciones (y aprobaciones, si hay override explícito) se conservan: son
 * operativa de gastos, no cifras de la empresa.
 *
 * Rol legacy `finanzas`: queda bloqueado por este lock (no hay usuarios
 * activos). Un tenant que necesite un perfil financiero real debe usar `admin`.
 */

import {
  applySensitiveSalaryRoleLock,
  canView,
  hasCapability,
  hasFacturacionCapability,
  isOwnerOrAdminRole,
  SUBMODULE_KEYS,
  type CapabilityKey,
  type FacturacionCapability,
  type PermissionLevel,
  type RolePermissions,
} from "@/lib/permissions";

/** Capabilities que un rol no-owner/admin nunca puede tener, ni por template. */
export const FINANCIAL_CAPABILITIES = [
  "banking_view",
  "banking_manage",
  "cashflow_view",
  "cashflow_manage",
  "cashflow_configure",
  "purchases_view",
  "accounting_view",
  "contabilidad_manage",
  "reports_finance_view",
  "finance_reports_view",
  "finance_reports_export",
  "finance_reports_drilldown",
  "facturacion_view",
  "facturacion_create_draft",
  "facturacion_issue",
  "facturacion_credit_note",
  "facturacion_void",
  "facturacion_resend_email",
  "facturacion_configure",
  "facturacion_manage",
  "rendicion_pay",
] as const satisfies readonly CapabilityKey[];

const FINANCIAL_CAPABILITY_SET = new Set<CapabilityKey>(FINANCIAL_CAPABILITIES);

/** Submódulos de finance que un no-admin PUEDE conservar si el override es explícito. */
const FINANCE_OPERATIONAL_SUBMODULES = ["rendiciones", "aprobaciones"] as const;

const FINANCIAL_DENIED = {
  ok: false as const,
  error: "No tienes permiso para consultar datos financieros.",
};

/**
 * Quita cifras de empresa a cualquier rol que no sea owner/admin.
 * Debe correr después de `mergeRolePermissions` + shims de compatibilidad.
 */
export function applyFinancialRoleLock(
  role: string,
  perms: RolePermissions,
): RolePermissions {
  if (isOwnerOrAdminRole(role)) return perms;

  const capabilities = { ...perms.capabilities };
  for (const cap of FINANCIAL_CAPABILITIES) {
    if (capabilities[cap] === true) capabilities[cap] = false;
  }

  const modules = {
    ...perms.modules,
    finance: "none" as const,
    cpq: "none" as const,
    payroll: "none" as const,
  };

  const submodules: Record<string, PermissionLevel> = { ...perms.submodules };

  for (const sub of SUBMODULE_KEYS.finance) {
    const key = `finance.${sub}`;
    const preserve =
      (FINANCE_OPERATIONAL_SUBMODULES as readonly string[]).includes(sub) &&
      key in perms.submodules;
    if (preserve) {
      submodules[key] = perms.submodules[key];
    } else {
      submodules[key] = "none";
    }
  }

  submodules["crm.deals"] = "none";
  submodules["crm.quotes"] = "none";

  for (const sub of SUBMODULE_KEYS.payroll) {
    submodules[`payroll.${sub}`] = "none";
  }

  return { ...perms, modules, submodules, capabilities };
}

/** Cadena de locks no-overridables (sueldo sensible + cifras financieras). */
export function applyRoleLocks(role: string, perms: RolePermissions): RolePermissions {
  return applyFinancialRoleLock(role, applySensitiveSalaryRoleLock(role, perms));
}

export function isFinancialCapability(cap: CapabilityKey): boolean {
  return FINANCIAL_CAPABILITY_SET.has(cap);
}

// ── Gate de tools del asistente IA / MCP / Slack / brief ──────────────

export type FinancialToolGuard = CapabilityKey | CapabilityKey[];

/**
 * Tools que exponen montos de cotización. Se autorizan con CPQ o crm.quotes.
 * (Mismo criterio que `get_quote_detail` / `ensureCanCreateQuote`.)
 */
export const FINANCIAL_QUOTE_TOOLS = new Set<string>([
  "search_quotes",
  "get_quote_detail",
  "get_quote_share_link",
  "get_quote_proposal",
  "create_quote",
  "clone_quote",
  "update_quote",
  "update_quote_parameters",
  "update_quote_margin",
  "update_quote_status",
  "manage_quote_lines",
  "manage_quote_extras",
  "manage_quote_includes",
  "add_quote_position",
  "preview_update_quote_position",
  "update_quote_position",
  "preview_remove_quote_position",
  "remove_quote_position",
  "preview_send_quote_proposal",
  "send_quote_proposal",
  "preview_delete_quote",
  "delete_quote",
  "preview_licitacion_indice",
  "licitacion_aplicar_indice",
  "preview_licitacion_cambio",
  "licitacion_aplicar_cambio",
  "preview_licitacion_regenerar",
  "licitacion_regenerar_seccion",
  "licitacion_estado",
  "licitacion_generar_secciones",
  "preview_propuesta_editar_seccion",
  "propuesta_editar_seccion",
]);

/** Tools que exponen montos de negocios / pipeline. */
export const FINANCIAL_DEAL_TOOLS = new Set<string>([
  "search_deals",
  "get_deal_pipeline",
  "get_deal_notes",
  "get_deal_communications",
  "list_deal_tasks",
  "create_deal",
  "update_deal",
  "add_deal_note",
  "create_deal_checklist",
  "preview_delete_deal",
  "delete_deal",
]);

/**
 * Mapa deny-by-default: tool → capability (o cualquiera de la lista).
 * Una tool financiera nueva que no esté aquí NI en QUOTE/DEAL y matchee
 * un prefijo de `FINANCIAL_TOOL_PREFIXES` se deniega.
 */
export const FINANCIAL_TOOL_GUARDS: Record<string, FinancialToolGuard> = {
  get_finance_summary: "purchases_view",
  flow_cashflow_overview: "cashflow_view",
  get_finance_dashboard_kpis: "reports_finance_view",
  get_income_statement: "reports_finance_view",
  get_balance_sheet: "reports_finance_view",
  get_sales_report: "reports_finance_view",
  get_profitability: "reports_finance_view",
  list_bank_movements: "banking_view",
  get_bank_movement: "banking_view",
  get_bank_triage_summary: "banking_view",
  list_flow_rows: ["banking_view", "cashflow_view"],
  preview_classify_bank_to_flow_row: "banking_manage",
  classify_bank_to_flow_row: "banking_manage",
  preview_authorize_bank_movements: "banking_manage",
  authorize_bank_movements: "banking_manage",
  search_dtes: "facturacion_view",
  get_dte_detail: "facturacion_view",
  search_received_dtes: "facturacion_view",
  search_invoice_drafts: "facturacion_view",
  search_recurring_invoices: "facturacion_view",
  preview_invoice_draft: "facturacion_create_draft",
  create_invoice_draft: "facturacion_create_draft",
  preview_credit_note_draft: "facturacion_credit_note",
  create_credit_note_draft: "facturacion_credit_note",
  preview_debit_note_draft: "facturacion_create_draft",
  create_debit_note_draft: "facturacion_create_draft",
  preview_recurring_invoice: "facturacion_create_draft",
  create_recurring_invoice: "facturacion_create_draft",
  preview_update_invoice_draft_refs: "facturacion_view",
  update_invoice_draft_refs: "facturacion_view",
  preview_update_recurring_invoice_refs: "facturacion_view",
  update_recurring_invoice_refs: "facturacion_view",
  update_dte_cost_center: "facturacion_view",
  create_factoring_company: "facturacion_view",
};

/**
 * Prefijos de tools financieras. Cualquier tool nueva que matchee y no esté
 * registrada en FINANCIAL_TOOL_GUARDS / QUOTE / DEAL se deniega.
 */
export const FINANCIAL_TOOL_PREFIXES = [
  "get_finance",
  "flow_",
  "list_bank",
  "get_bank",
  "search_dtes",
  "get_dte",
  "search_received_dtes",
  "preview_invoice",
  "create_invoice",
  "preview_credit_note",
  "create_credit_note",
  "preview_debit_note",
  "create_debit_note",
  "preview_recurring",
  "create_recurring_invoice",
  "search_invoice",
  "search_recurring",
  "preview_update_invoice",
  "update_invoice",
  "preview_update_recurring",
  "update_recurring",
  "update_dte",
  "authorize_bank",
  "preview_authorize_bank",
  "preview_classify_bank",
  "classify_bank",
  "list_flow",
  "get_income_statement",
  "get_balance_sheet",
  "get_sales_report",
  "get_profitability",
  "get_quote",
  "search_quotes",
  "clone_quote",
  "manage_quote",
  "update_quote",
  "create_quote",
  "preview_update_quote",
  "preview_remove_quote",
  "remove_quote",
  "preview_send_quote",
  "send_quote",
  "preview_delete_quote",
  "delete_quote",
  "preview_licitacion",
  "licitacion_",
  "preview_propuesta",
  "propuesta_editar",
  "get_deal_pipeline",
  "search_deals",
] as const;

function hasAnyCapability(perms: RolePermissions, caps: CapabilityKey[]): boolean {
  return caps.some((cap) => {
    if (cap.startsWith("facturacion_")) {
      return hasFacturacionCapability(perms, cap as FacturacionCapability);
    }
    return hasCapability(perms, cap);
  });
}

function isRegisteredFinancialTool(toolName: string): boolean {
  return (
    toolName in FINANCIAL_TOOL_GUARDS ||
    FINANCIAL_QUOTE_TOOLS.has(toolName) ||
    FINANCIAL_DEAL_TOOLS.has(toolName)
  );
}

function matchesFinancialPrefix(toolName: string): boolean {
  return FINANCIAL_TOOL_PREFIXES.some((prefix) => toolName.startsWith(prefix));
}

/** ¿El usuario puede ejecutar esta tool financiera? (true = permitido o no es financiera). */
export function canExecuteFinancialTool(toolName: string, perms: RolePermissions): boolean {
  if (FINANCIAL_QUOTE_TOOLS.has(toolName)) {
    return canView(perms, "cpq") || canView(perms, "crm", "quotes");
  }
  if (FINANCIAL_DEAL_TOOLS.has(toolName)) {
    return canView(perms, "crm", "deals");
  }
  const guard = FINANCIAL_TOOL_GUARDS[toolName];
  if (guard) {
    const caps = Array.isArray(guard) ? guard : [guard];
    return hasAnyCapability(perms, caps);
  }
  if (matchesFinancialPrefix(toolName)) {
    return false;
  }
  return true;
}

/**
 * Deny-by-default para el dispatcher de tools IA.
 * `null` = seguir; objeto `{ ok:false }` = cortar con error de permiso.
 */
export function denyFinancialToolIfUnauthorized(
  toolName: string,
  perms: RolePermissions,
): { ok: false; error: string } | null {
  if (canExecuteFinancialTool(toolName, perms)) return null;
  return FINANCIAL_DENIED;
}

export function isFinancialToolName(toolName: string): boolean {
  return isRegisteredFinancialTool(toolName) || matchesFinancialPrefix(toolName);
}

/** Columnas de la matriz de auditoría de acceso financiero (valores efectivos post-lock). */
export const FINANCIAL_AUDIT_COLUMNS = [
  { key: "deals", label: "Negocios" },
  { key: "quotes", label: "Cotiz." },
  { key: "cpq", label: "CPQ" },
  { key: "payroll", label: "Payroll" },
  { key: "cashflow_view", label: "Caja" },
  { key: "banking_view", label: "Banca" },
  { key: "purchases_view", label: "Compras" },
  { key: "facturacion_view", label: "Factur." },
  { key: "reports_finance_view", label: "Reportes" },
  { key: "rendiciones", label: "Rendic." },
] as const;

export type FinancialAuditMatrixKey = (typeof FINANCIAL_AUDIT_COLUMNS)[number]["key"];

export type FinancialAuditMatrix = Record<FinancialAuditMatrixKey, boolean>;

export type FinancialAuditRow = {
  id: string;
  email: string;
  name: string;
  role: string;
  templateName: string | null;
  templateSlug: string | null;
  matrix: FinancialAuditMatrix;
};
