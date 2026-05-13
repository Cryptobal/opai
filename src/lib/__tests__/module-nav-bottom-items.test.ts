import { describe, expect, it } from "vitest";
import { getBottomNavItems } from "@/lib/module-nav";

const ALL_ENABLED = new Set([
  "crm",
  "cpq",
  "ops",
  "ops_rondas",
  "ops_supervision",
  "ops_inventario",
  "ops_onboarding",
  "alertas_cobertura",
  "ats",
  "gamificacion",
  "psych",
  "finanzas",
  "documentos",
  "payroll",
  "reportes_dt",
  "portal_guardia",
  "portal_cliente",
  "portal_marcacion",
  "control_acceso",
]);

describe("getBottomNavItems — back-compat snapshots", () => {
  it("CRM main page → leads, accounts, deals, contacts, quotes, prospecting, installations", () => {
    const items = getBottomNavItems("/crm", "owner", ALL_ENABLED);
    const hrefs = items.map((i) => i.href);
    expect(hrefs).toContain("/crm/leads");
    expect(hrefs).toContain("/crm/accounts");
    expect(hrefs).toContain("/crm/deals");
    expect(hrefs).toContain("/crm/contacts");
    expect(hrefs).toContain("/crm/cotizaciones");
    expect(hrefs).toContain("/crm/prospecting");
    expect(hrefs).toContain("/crm/installations");
  });

  it("Ops main page → ATS, Pautas, Supervision, Tickets, Rondas, Alertas, Inventario, Instalaciones", () => {
    const items = getBottomNavItems("/ops", "owner", ALL_ENABLED);
    const hrefs = items.map((i) => i.href);
    expect(hrefs).toContain("/ops/ats");
    expect(hrefs).toContain("/ops/pauta-mensual"); // pautas N2 entrypoint
    expect(hrefs).toContain("/ops/supervision");
    expect(hrefs).toContain("/ops/tickets");
    expect(hrefs).toContain("/ops/rondas");
    expect(hrefs).toContain("/ops/alertas-cobertura");
    expect(hrefs).toContain("/ops/inventario");
    expect(hrefs).toContain("/crm/installations");
  });

  it("Pautas inner page → mensual, diaria, te, ppc, refuerzos, marcaciones, auditoría", () => {
    const items = getBottomNavItems("/ops/pauta-diaria", "owner", ALL_ENABLED);
    const hrefs = items.map((i) => i.href);
    expect(hrefs).toContain("/ops/pauta-mensual");
    expect(hrefs).toContain("/ops/pauta-diaria");
    expect(hrefs).toContain("/ops/turnos-extra");
    expect(hrefs).toContain("/ops/ppc");
    expect(hrefs).toContain("/ops/refuerzos");
    expect(hrefs).toContain("/ops/marcaciones");
    expect(hrefs).toContain("/ops/audit-pautas");
  });

  it("Rondas inner → dashboard, monitor, alertas, reportes, centro IA, config", () => {
    const items = getBottomNavItems("/ops/rondas/monitoreo", "owner", ALL_ENABLED);
    const hrefs = items.map((i) => i.href);
    expect(hrefs).toContain("/ops/rondas");
    expect(hrefs).toContain("/ops/rondas/monitoreo");
    expect(hrefs).toContain("/ops/rondas/alertas");
    expect(hrefs).toContain("/ops/rondas/reportes");
    expect(hrefs).toContain("/ops/rondas/centro-ia");
    expect(hrefs).toContain("/ops/rondas/configuracion");
  });

  it("Inventario inner → all 8 sections (sin Configuración en bottom nav)", () => {
    const items = getBottomNavItems("/ops/inventario/productos", "owner", ALL_ENABLED);
    const hrefs = items.map((i) => i.href);
    expect(hrefs).toContain("/ops/inventario");
    expect(hrefs).toContain("/ops/inventario/productos");
    expect(hrefs).toContain("/ops/inventario/bodegas");
    expect(hrefs).toContain("/ops/inventario/compras");
    expect(hrefs).toContain("/ops/inventario/entregas");
    expect(hrefs).toContain("/ops/inventario/stock");
    expect(hrefs).toContain("/ops/inventario/activos");
    expect(hrefs).toContain("/ops/inventario/lineas");
    // Configuración está oculto en el bottom nav (hideInBottomNav)
    expect(hrefs).not.toContain("/ops/inventario/configuracion");
  });

  it("Finanzas main → ventas, compras, banca, contabilidad, informes, rendiciones", () => {
    const items = getBottomNavItems("/finanzas", "owner", ALL_ENABLED);
    const hrefs = items.map((i) => i.href);
    expect(hrefs).toContain("/finanzas/rendiciones");
    expect(hrefs).toContain("/finanzas/facturacion");
    expect(hrefs).toContain("/finanzas/proveedores");
    expect(hrefs).toContain("/finanzas/bancos");
    expect(hrefs).toContain("/finanzas/contabilidad");
    expect(hrefs).toContain("/finanzas/reportes");
  });

  it("Reportes inner → bottom nav shows N2 (finance children), no N3 dropdown", () => {
    const items = getBottomNavItems("/finanzas/reportes/eerr", "owner", ALL_ENABLED);
    const hrefs = items.map((i) => i.href);
    // N2 finance items (PR: bottom nav always shows N2 inside /finanzas)
    expect(hrefs).toContain("/finanzas/rendiciones");
    expect(hrefs).toContain("/finanzas/facturacion");
    expect(hrefs).toContain("/finanzas/bancos");
    expect(hrefs).toContain("/finanzas/contabilidad");
    expect(hrefs).toContain("/finanzas/reportes");
    // N3 reportes children should NOT appear (chips live above the hero now)
    expect(hrefs).not.toContain("/finanzas/reportes/eerr");
    expect(hrefs).not.toContain("/finanzas/reportes/balance");
  });

  it("Facturación inner → bottom nav shows N2 finance items, not N3 DTEs", () => {
    const items = getBottomNavItems("/finanzas/facturacion/dtes", "owner", ALL_ENABLED);
    const hrefs = items.map((i) => i.href);
    expect(hrefs).toContain("/finanzas/rendiciones");
    expect(hrefs).toContain("/finanzas/facturacion");
    expect(hrefs).toContain("/finanzas/bancos");
    expect(hrefs).toContain("/finanzas/contabilidad");
    expect(hrefs).toContain("/finanzas/reportes");
    expect(hrefs).not.toContain("/finanzas/facturacion/dtes");
    expect(hrefs).not.toContain("/finanzas/facturacion/cesiones");
  });

  it("Rendiciones inner → bottom nav shows N2 finance items, not N3 historial", () => {
    const items = getBottomNavItems(
      "/finanzas/rendiciones/historial-pagos",
      "owner",
      ALL_ENABLED,
    );
    const hrefs = items.map((i) => i.href);
    expect(hrefs).toContain("/finanzas/rendiciones");
    expect(hrefs).toContain("/finanzas/facturacion");
    expect(hrefs).toContain("/finanzas/bancos");
    expect(hrefs).toContain("/finanzas/contabilidad");
    expect(hrefs).toContain("/finanzas/reportes");
    expect(hrefs).not.toContain("/finanzas/rendiciones/historial-pagos");
  });

  it("Ops Rondas inner still shows N3 (no regression)", () => {
    const items = getBottomNavItems("/ops/rondas/alertas", "owner", ALL_ENABLED);
    const hrefs = items.map((i) => i.href);
    expect(hrefs).toContain("/ops/rondas");
    expect(hrefs).toContain("/ops/rondas/monitoreo");
    expect(hrefs).toContain("/ops/rondas/alertas");
    expect(hrefs).toContain("/ops/rondas/reportes");
  });

  it("Personas inner → listado, conocimiento, onboarding, comunicaciones, sueldos, gamificación, psicolab", () => {
    const items = getBottomNavItems("/personas/guardias", "owner", ALL_ENABLED);
    const hrefs = items.map((i) => i.href);
    expect(hrefs).toContain("/personas/guardias");
    expect(hrefs).toContain("/personas/conocimiento");
    expect(hrefs).toContain("/personas/onboarding");
    expect(hrefs).toContain("/personas/comunicaciones");
    expect(hrefs).toContain("/personas/guardias/sueldos-rut");
    expect(hrefs).toContain("/personas/gamificacion");
    expect(hrefs).toContain("/personas/psicolaboral");
  });

  it("Payroll inner → periodos, asistencia, anticipos, simulator, parameters", () => {
    const items = getBottomNavItems("/payroll/periodos", "owner", ALL_ENABLED);
    const hrefs = items.map((i) => i.href);
    expect(hrefs).toContain("/payroll/periodos");
    expect(hrefs).toContain("/payroll/asistencia");
    expect(hrefs).toContain("/payroll/anticipos");
    expect(hrefs).toContain("/payroll/simulator");
    expect(hrefs).toContain("/payroll/parameters");
  });

  it("Docs inner → gestion, operativos, templates", () => {
    const items = getBottomNavItems("/opai/documentos", "owner", ALL_ENABLED);
    const hrefs = items.map((i) => i.href);
    expect(hrefs).toContain("/opai/documentos");
    expect(hrefs).toContain("/opai/documentos-operativos");
    expect(hrefs).toContain("/opai/documentos/templates");
  });

  it("Reportes DT inner → asistencia, jornada, festivos, modificaciones", () => {
    const items = getBottomNavItems("/reportes/dt/asistencia-diaria", "owner", ALL_ENABLED);
    const hrefs = items.map((i) => i.href);
    expect(hrefs).toContain("/reportes/dt/asistencia-diaria");
    expect(hrefs).toContain("/reportes/dt/jornada-diaria");
    expect(hrefs).toContain("/reportes/dt/domingos-festivos");
    expect(hrefs).toContain("/reportes/dt/modificaciones-turnos");
  });

  it("Configuración inner → todas las sub-secciones config principales", () => {
    const items = getBottomNavItems("/opai/configuracion/usuarios", "owner", ALL_ENABLED);
    const hrefs = items.map((i) => i.href);
    expect(hrefs).toContain("/opai/configuracion/usuarios");
    expect(hrefs).toContain("/opai/configuracion/grupos");
    expect(hrefs).toContain("/opai/configuracion/integraciones");
    expect(hrefs).toContain("/opai/configuracion/notificaciones");
  });

  it("Returns [] for unknown path", () => {
    expect(getBottomNavItems("/totally/unknown", "owner", ALL_ENABLED)).toEqual([]);
  });

  it("Respects tenant module: ats disabled hides ATS in Ops", () => {
    const noAts = new Set(ALL_ENABLED);
    noAts.delete("ats");
    const items = getBottomNavItems("/ops", "owner", noAts);
    const hrefs = items.map((i) => i.href);
    expect(hrefs).not.toContain("/ops/ats");
    expect(hrefs).toContain("/ops/tickets");
  });

  it("Respects role: guardia (no CRM) gets [] on /crm", () => {
    const items = getBottomNavItems("/crm", "guardia", ALL_ENABLED);
    expect(items).toEqual([]);
  });
});
