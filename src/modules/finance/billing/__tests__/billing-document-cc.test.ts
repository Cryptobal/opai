import { describe, it, expect } from "vitest";
import { mergeBillingDocumentCc } from "../billing-document-cc";

describe("mergeBillingDocumentCc", () => {
  const cron = {
    cronCcCsv: "ops@tenant.cl",
    ccoFinanceCsv: "facturacion@tenant.cl",
  };

  it("cron: internos van en CC visible (cronCc + CCO finanzas)", () => {
    const cc = mergeBillingDocumentCc({
      isAutoFromCron: true,
      existingCc: ["otro@cliente.cl"],
      primary: "cliente@acme.cl",
      ...cron,
    });
    expect(cc).toEqual([
      "otro@cliente.cl",
      "ops@tenant.cl",
      "facturacion@tenant.cl",
    ]);
  });

  it("envío manual: CCO de finanzas NO entra en CC (sigue oculto)", () => {
    const cc = mergeBillingDocumentCc({
      isAutoFromCron: false,
      existingCc: ["otro@cliente.cl"],
      primary: "cliente@acme.cl",
      ...cron,
    });
    expect(cc).toEqual(["otro@cliente.cl"]);
  });

  it("cron: no duplica si el grupo ya está en CC del plan", () => {
    const cc = mergeBillingDocumentCc({
      isAutoFromCron: true,
      existingCc: ["Facturacion@tenant.cl"],
      primary: "cliente@acme.cl",
      ...cron,
    });
    expect(cc).toEqual(["Facturacion@tenant.cl", "ops@tenant.cl"]);
  });

  it("cron: no pone el primary en CC", () => {
    const cc = mergeBillingDocumentCc({
      isAutoFromCron: true,
      existingCc: [],
      primary: "ops@tenant.cl",
      ...cron,
    });
    expect(cc).toEqual(["facturacion@tenant.cl"]);
  });
});
