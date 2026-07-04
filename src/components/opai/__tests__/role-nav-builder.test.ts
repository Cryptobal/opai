import { describe, expect, it } from "vitest";
import { buildNavItems } from "@/components/opai/role-nav-builder";
import { getDefaultPermissions } from "@/lib/permissions";

const allEnabled = () => true;

describe("buildNavItems — sidebar back-compat", () => {
  it("owner gets all main modules with their children", () => {
    const items = buildNavItems({
      permissions: getDefaultPermissions("owner"),
      isAdmin: true,
      isComplianceVisible: true,
      isModuleEnabled: allEnabled,
    });

    const visible = items.filter((i) => i.show !== false);
    const labels = visible.map((i) => i.label);

    expect(labels).toContain("Inicio");
    expect(labels).toContain("Comercial");
    expect(labels).toContain("Operaciones");
    expect(labels).toContain("Personas");
    expect(labels).toContain("Payroll");
    expect(labels).toContain("Finanzas");
    expect(labels).toContain("Documentos");
    expect(labels).toContain("Cumplimiento");
    // Configuración and Chat are NOT in the sidebar — they live in the topbar.
    expect(labels).not.toContain("Configuración");
    expect(labels).not.toContain("Chat");
  });

  it("CRM has expected children", () => {
    const items = buildNavItems({
      permissions: getDefaultPermissions("owner"),
      isAdmin: true,
      isComplianceVisible: false,
      isModuleEnabled: allEnabled,
    });
    const crm = items.find((i) => i.label === "Comercial");
    const childLabels = crm?.children?.map((c) => c.label) ?? [];
    expect(childLabels).toContain("Leads");
    expect(childLabels).toContain("Cuentas");
    expect(childLabels).toContain("Negocios");
    expect(childLabels).toContain("Contactos");
    expect(childLabels).toContain("Cotizaciones");
    expect(childLabels).toContain("Instalaciones");
    // "Prospección" se retiró del sidebar comercial.
    expect(childLabels).not.toContain("Prospección");
  });

  it("Finanzas children include Inicio, Rendiciones, Compras y Ventas, Banca, Contabilidad, Informes", () => {
    const items = buildNavItems({
      permissions: getDefaultPermissions("owner"),
      isAdmin: true,
      isComplianceVisible: false,
      isModuleEnabled: allEnabled,
    });
    const fin = items.find((i) => i.label === "Finanzas");
    const childLabels = fin?.children?.map((c) => c.label) ?? [];
    expect(childLabels).toContain("Inicio");
    expect(childLabels).toContain("Rendiciones");
    // "Ventas" y "Compras" se fusionaron en el nodo "Compras y Ventas"
    // (Facturación + Proveedores como N3).
    expect(childLabels).toContain("Compras y Ventas");
    expect(childLabels).toContain("Banca");
    expect(childLabels).toContain("Contabilidad");
    expect(childLabels).toContain("Informes");
  });

  it("Cumplimiento appears with show:true if isComplianceVisible", () => {
    const items = buildNavItems({
      permissions: getDefaultPermissions("owner"),
      isAdmin: true,
      isComplianceVisible: true,
      isModuleEnabled: allEnabled,
    });
    const compliance = items.find((i) => i.label === "Cumplimiento");
    expect(compliance?.show).toBe(true);
  });

  it("Cumplimiento hidden (show:false) when isComplianceVisible is false", () => {
    const items = buildNavItems({
      permissions: getDefaultPermissions("guardia"),
      isAdmin: false,
      isComplianceVisible: false,
      isModuleEnabled: allEnabled,
    });
    const compliance = items.find((i) => i.label === "Cumplimiento");
    expect(compliance?.show).toBe(false);
  });

  it("guardia role hides modules they cannot access (show:false)", () => {
    const items = buildNavItems({
      permissions: getDefaultPermissions("guardia"),
      isAdmin: false,
      isComplianceVisible: false,
      isModuleEnabled: allEnabled,
    });
    const crm = items.find((i) => i.label === "Comercial");
    expect(crm?.show).toBe(false);
  });

  it("Hub appears at the top, then modules (Chat lives in the topbar, not the sidebar)", () => {
    const items = buildNavItems({
      permissions: getDefaultPermissions("owner"),
      isAdmin: true,
      isComplianceVisible: false,
      isModuleEnabled: allEnabled,
    });
    expect(items[0].label).toBe("Inicio");
    expect(items.map((i) => i.label)).not.toContain("Chat");
    expect(items.map((i) => i.label)).not.toContain("Configuración");
  });

  it("Portal admin module appears for admin only", () => {
    const adminItems = buildNavItems({
      permissions: getDefaultPermissions("owner"),
      isAdmin: true,
      isComplianceVisible: false,
      isModuleEnabled: allEnabled,
    });
    const portales = adminItems.find((i) => i.label === "Portales");
    expect(portales?.show).toBe(true);

    const guardiaItems = buildNavItems({
      permissions: getDefaultPermissions("guardia"),
      isAdmin: false,
      isComplianceVisible: false,
      isModuleEnabled: allEnabled,
    });
    const guardiaPortales = guardiaItems.find((i) => i.label === "Portales");
    expect(guardiaPortales?.show).toBe(false);
  });

  it("CPQ disabled hides Cotizaciones in CRM children", () => {
    const items = buildNavItems({
      permissions: getDefaultPermissions("owner"),
      isAdmin: true,
      isComplianceVisible: false,
      isModuleEnabled: (k) => k !== "cpq",
    });
    const crm = items.find((i) => i.label === "Comercial");
    const childLabels = crm?.children?.map((c) => c.label) ?? [];
    expect(childLabels).not.toContain("Cotizaciones");
  });
});
