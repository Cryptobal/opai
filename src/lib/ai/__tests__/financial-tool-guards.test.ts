import { describe, expect, it } from "vitest";
import {
  canExecuteFinancialTool,
  denyFinancialToolIfUnauthorized,
  FINANCIAL_TOOL_GUARDS,
  FINANCIAL_TOOL_PREFIXES,
} from "@/lib/financial-access";
import { DEFAULT_ROLE_PERMISSIONS, type RolePermissions } from "@/lib/permissions";

const SUPERVISOR = DEFAULT_ROLE_PERMISSIONS.supervisor;
const ADMIN = DEFAULT_ROLE_PERMISSIONS.admin;
const OWNER = DEFAULT_ROLE_PERMISSIONS.owner;

describe("denyFinancialToolIfUnauthorized", () => {
  it("deniega get_finance_summary sin purchases_view", () => {
    const denied = denyFinancialToolIfUnauthorized("get_finance_summary", SUPERVISOR);
    expect(denied).not.toBeNull();
    expect(denied!.ok).toBe(false);
    expect(denied!.error).toMatch(/permiso/i);
  });

  it("deniega flow_cashflow_overview sin cashflow_view", () => {
    const denied = denyFinancialToolIfUnauthorized("flow_cashflow_overview", SUPERVISOR);
    expect(denied).not.toBeNull();
    expect(denied!.ok).toBe(false);
  });

  it("permite get_finance_summary a admin", () => {
    expect(denyFinancialToolIfUnauthorized("get_finance_summary", ADMIN)).toBeNull();
    expect(canExecuteFinancialTool("get_finance_summary", ADMIN)).toBe(true);
  });

  it("permite flow_cashflow_overview a owner", () => {
    expect(denyFinancialToolIfUnauthorized("flow_cashflow_overview", OWNER)).toBeNull();
  });

  it("tool con prefijo financiero no registrada queda denied", () => {
    const denied = denyFinancialToolIfUnauthorized("get_finance_secret_new_tool", ADMIN);
    expect(denied).not.toBeNull();
    expect(denied!.error).toMatch(/permiso/i);
  });

  it("tools operativas fuera del mapa no se bloquean (tickets, rendiciones)", () => {
    expect(denyFinancialToolIfUnauthorized("get_tickets_summary", SUPERVISOR)).toBeNull();
    expect(denyFinancialToolIfUnauthorized("get_pending_rendiciones", SUPERVISOR)).toBeNull();
    expect(denyFinancialToolIfUnauthorized("search_guardias", SUPERVISOR)).toBeNull();
  });

  it("quotes se deniegan si no hay cpq ni crm.quotes", () => {
    expect(denyFinancialToolIfUnauthorized("get_quote_detail", SUPERVISOR)).not.toBeNull();
    expect(denyFinancialToolIfUnauthorized("search_quotes", ADMIN)).toBeNull();
  });

  it("deals se deniegan sin crm.deals", () => {
    expect(denyFinancialToolIfUnauthorized("get_deal_pipeline", SUPERVISOR)).not.toBeNull();
    expect(denyFinancialToolIfUnauthorized("get_deal_pipeline", ADMIN)).toBeNull();
  });

  it("FINANCIAL_TOOL_GUARDS cubre las tools de caja y ventas del brief", () => {
    expect(FINANCIAL_TOOL_GUARDS.get_finance_summary).toBe("purchases_view");
    expect(FINANCIAL_TOOL_GUARDS.flow_cashflow_overview).toBe("cashflow_view");
    expect(FINANCIAL_TOOL_GUARDS.get_sales_report).toBe("reports_finance_view");
    expect(FINANCIAL_TOOL_PREFIXES.some((p) => p === "get_finance")).toBe(true);
  });

  it("emit_invoice_draft exige capability de emisión y no queda unregistered", () => {
    expect(FINANCIAL_TOOL_GUARDS.preview_emit_invoice_draft).toEqual([
      "facturacion_issue",
      "facturacion_credit_note",
    ]);
    expect(FINANCIAL_TOOL_GUARDS.emit_invoice_draft).toEqual([
      "facturacion_issue",
      "facturacion_credit_note",
    ]);
    expect(denyFinancialToolIfUnauthorized("emit_invoice_draft", SUPERVISOR)).not.toBeNull();
    expect(denyFinancialToolIfUnauthorized("preview_emit_invoice_draft", ADMIN)).toBeNull();
    expect(denyFinancialToolIfUnauthorized("emit_invoice_draft", ADMIN)).toBeNull();
  });

  it("admin sintético sin purchases_view no pasa el gate (capa extra al lock)", () => {
    const stripped: RolePermissions = {
      ...ADMIN,
      capabilities: { ...ADMIN.capabilities, purchases_view: false },
    };
    expect(denyFinancialToolIfUnauthorized("get_finance_summary", stripped)).not.toBeNull();
  });
});
