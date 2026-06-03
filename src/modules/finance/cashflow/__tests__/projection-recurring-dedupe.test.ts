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

  it("deja CONTRACT si no hay recurrente para esa instalación", () => {
    const items = [
      { source: "CONTRACT", crmAccountId: acc, installationId: inst },
    ];
    expect(filterCashflowItemsForProjection(items)).toHaveLength(1);
  });
});
