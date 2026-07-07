import { describe, expect, it } from "vitest";
import {
  formatQuoteViewedLabel,
  quoteViewedFields,
  resolveQuoteClientName,
  resolveQuoteDisplayName,
} from "../quote-viewed";

describe("resolveQuoteDisplayName", () => {
  it("prefiere name, luego deal title y finalmente el codigo", () => {
    expect(
      resolveQuoteDisplayName({
        name: "Teleférico Alto Hospicio",
        dealTitle: "Negocio legacy",
        code: "CPQ-2026-195-b21e",
      }),
    ).toBe("Teleférico Alto Hospicio");

    expect(
      resolveQuoteDisplayName({
        name: null,
        dealTitle: "Teleférico Alto Hospicio",
        code: "CPQ-2026-195-b21e",
      }),
    ).toBe("Teleférico Alto Hospicio");

    expect(
      resolveQuoteDisplayName({
        name: null,
        dealTitle: null,
        code: "CPQ-2026-195-b21e",
      }),
    ).toBe("CPQ-2026-195-b21e");
  });
});

describe("resolveQuoteClientName", () => {
  it("prefiere clientName y cae a la cuenta CRM", () => {
    expect(resolveQuoteClientName({ clientName: "Cointer", accountName: "Otro" })).toBe("Cointer");
    expect(resolveQuoteClientName({ clientName: null, accountName: "Cointer" })).toBe("Cointer");
    expect(resolveQuoteClientName({ clientName: null, accountName: null })).toBe("");
  });
});

describe("formatQuoteViewedLabel", () => {
  it("muestra nombre y codigo cuando difieren", () => {
    expect(formatQuoteViewedLabel("Teleférico Alto Hospicio", "CPQ-2026-195-b21e")).toBe(
      "Teleférico Alto Hospicio (CPQ-2026-195-b21e)",
    );
    expect(formatQuoteViewedLabel("CPQ-2026-195-b21e", "CPQ-2026-195-b21e")).toBe("CPQ-2026-195-b21e");
  });
});

describe("quoteViewedFields", () => {
  it("incluye cotizacion, cliente y montos curados", () => {
    expect(
      quoteViewedFields({
        cotizacion: "Teleférico Alto Hospicio",
        code: "CPQ-2026-195-b21e",
        cliente: "Cointer",
        montoTxt: "$16.403.376",
        vista: 1,
      }),
    ).toEqual([
      { label: "Cotización", value: "Teleférico Alto Hospicio (CPQ-2026-195-b21e)" },
      { label: "Cliente", value: "Cointer" },
      { label: "Monto", value: "$16.403.376/mes" },
      { label: "Vista", value: "#1" },
    ]);
  });
});
