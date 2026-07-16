import { describe, it, expect } from "vitest";
import { filterCashflowItemsForProjection } from "../projection-item-filter";

describe("filterCashflowItemsForProjection (RECURRING_DTE manda)", () => {
  const acc = "acc-trans";
  const inst = "inst-trans";

  it("oculta CONTRACT cuando hay RECURRING_DTE en la misma instalación", () => {
    const items = [
      { source: "CONTRACT", crmAccountId: acc, installationId: inst },
      { source: "RECURRING_DTE", crmAccountId: acc, installationId: inst },
    ];
    const out = filterCashflowItemsForProjection(items);
    expect(out).toHaveLength(1);
    expect(out[0].source).toBe("RECURRING_DTE");
  });

  it("mantiene 2+ RECURRING_DTE y oculta CONTRACT (Transmat)", () => {
    const items = [
      { source: "CONTRACT", crmAccountId: acc, installationId: inst },
      {
        source: "RECURRING_DTE",
        crmAccountId: acc,
        installationId: inst,
        sourceRefId: "tpl-day-1",
      },
      {
        source: "RECURRING_DTE",
        crmAccountId: acc,
        installationId: inst,
        sourceRefId: "tpl-day-20",
      },
    ];
    const out = filterCashflowItemsForProjection(items);
    expect(out).toHaveLength(2);
    expect(out.every((i) => i.source === "RECURRING_DTE")).toBe(true);
  });

  it("oculta OTHER con sourceRefId cuando hay recurrente", () => {
    const items = [
      {
        source: "OTHER",
        crmAccountId: acc,
        installationId: inst,
        sourceRefId: "doc-1",
      },
      { source: "RECURRING_DTE", crmAccountId: acc, installationId: inst },
    ];
    expect(filterCashflowItemsForProjection(items)).toHaveLength(1);
  });

  it("oculta CONTRACT SIEMPRE, aunque no haya recurrente (el contrato no entra al flujo)", () => {
    const items = [
      { source: "CONTRACT", crmAccountId: acc, installationId: inst },
    ];
    // El contrato por sí mismo no proyecta: al flujo solo entran DTE
    // recurrentes/emitidos y borradores. La factura emitida de este contrato
    // caería a su propia fila (Path 2) con su monto real.
    expect(filterCashflowItemsForProjection(items)).toHaveLength(0);
  });

  it("mantiene OTHER-con-sourceRefId cuando NO hay recurrente (no es CONTRACT puro)", () => {
    const items = [
      {
        source: "OTHER",
        crmAccountId: acc,
        installationId: inst,
        sourceRefId: "doc-1",
      },
    ];
    expect(filterCashflowItemsForProjection(items)).toHaveLength(1);
  });
});
