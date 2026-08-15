import { describe, expect, it } from "vitest";
import { buildCpqQuotePdfFileName } from "../cpq-quote-pdf-filename";

describe("buildCpqQuotePdfFileName", () => {
  it("incluye suffix descriptivo para distinguir adjuntos", () => {
    const base = {
      clientName: "Cliente SA",
      installationName: "Planta",
      quoteName: "Servicio 24/7",
      quoteCode: "CPQ-2026-001",
    };
    expect(buildCpqQuotePdfFileName({ ...base, suffix: "Propuesta Técnica" })).toBe(
      "Cliente SA - CPQ-2026-001 - Servicio 24 7 - Propuesta Técnica.pdf",
    );
    expect(buildCpqQuotePdfFileName({ ...base, suffix: "Cotización" })).toBe(
      "Cliente SA - CPQ-2026-001 - Servicio 24 7 - Cotización.pdf",
    );
  });
});
