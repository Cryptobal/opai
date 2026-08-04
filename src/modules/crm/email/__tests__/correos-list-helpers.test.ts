import { describe, expect, it } from "vitest";
import {
  buildTenantDomains,
  domainOf,
  isSystemSender,
  pickThreadListPreview,
} from "../correos-list-helpers";

describe("domainOf", () => {
  it("parsea headers con display name y via", () => {
    expect(domainOf("'Alvaro' via Comercial <comercial@gard.cl>")).toBe("gard.cl");
    expect(
      domainOf("'Alvaro Enrique Contreras Peralta' via Comercial <comercial@gard.cl>"),
    ).toBe("gard.cl");
  });

  it("funciona con dirección desnuda", () => {
    expect(domainOf("cliente@iplacex.cl")).toBe("iplacex.cl");
  });

  it("devuelve null sin email", () => {
    expect(domainOf(null)).toBeNull();
    expect(domainOf("sin-arroba")).toBeNull();
  });
});

describe("isSystemSender", () => {
  const tenantDomains = new Set(["gard.cl"]);

  it("detecta remitente propio con header crudo", () => {
    expect(
      isSystemSender("'Alvaro' via Comercial <comercial@gard.cl>", tenantDomains),
    ).toBe(true);
  });

  it("detecta no-reply", () => {
    expect(isSystemSender("no-reply@x.cl", tenantDomains)).toBe(true);
    expect(isSystemSender("noreply@otro.cl", tenantDomains)).toBe(true);
  });

  it("no marca cliente externo", () => {
    expect(isSystemSender("acontreras@iplacex.cl", tenantDomains)).toBe(false);
    expect(
      isSystemSender("Alvaro Contreras <acontreras@iplacex.cl>", tenantDomains),
    ).toBe(false);
  });
});

describe("buildTenantDomains", () => {
  it("incluye dominios de company y casilla no pública", () => {
    const domains = buildTenantDomains(
      {
        emailFromAddress: "noreply@gard.cl",
        email: "contacto@gard.cl",
        emailOps: null,
        emailFinance: null,
        emailContact: null,
        emailReplyTo: null,
      },
      "comercial@gard.cl",
    );
    expect(domains.has("gard.cl")).toBe(true);
  });

  it("excluye dominio público de la casilla", () => {
    const domains = buildTenantDomains(
      { emailFromAddress: "a@empresa.cl" },
      "user@gmail.com",
    );
    expect(domains.has("empresa.cl")).toBe(true);
    expect(domains.has("gmail.com")).toBe(false);
  });
});

describe("pickThreadListPreview", () => {
  it("usa el no-borrador como remitente y el borrador como snippet", () => {
    const preview = pickThreadListPreview([
      {
        fromEmail: "yo@gard.cl",
        textBody: "Estimado Luis, acusamos recibo…",
        htmlBody: null,
        isDraft: true,
      },
      {
        fromEmail: "Luis PEREZ <luis@coexpan.cl>",
        textBody: "Adjunto bases de licitación",
        htmlBody: null,
        isDraft: false,
      },
    ]);
    expect(preview.hasDraftInWindow).toBe(true);
    expect(preview.fromEmail).toBe("Luis PEREZ <luis@coexpan.cl>");
    expect(preview.snippet).toMatch(/Estimado Luis/);
  });

  it("sin borrador usa el último mensaje", () => {
    const preview = pickThreadListPreview([
      {
        fromEmail: "cliente@x.cl",
        textBody: "Hola",
        htmlBody: null,
        isDraft: false,
      },
    ]);
    expect(preview.hasDraftInWindow).toBe(false);
    expect(preview.fromEmail).toBe("cliente@x.cl");
    expect(preview.snippet).toBe("Hola");
  });
});
