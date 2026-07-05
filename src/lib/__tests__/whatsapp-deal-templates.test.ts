import { describe, expect, it } from "vitest";
import { enrichDealForWaTemplate } from "@/lib/whatsapp-templates";
import { plainTextToTiptapJson } from "@/lib/docs/wa-template-seeds";
import { resolveDocument, tiptapToPlainText } from "@/lib/docs/token-resolver";

describe("enrichDealForWaTemplate", () => {
  it("expone proposalSentDate y proposalLink para tokens de seguimiento", () => {
    const enriched = enrichDealForWaTemplate(
      {
        title: "Seguridad Planta Norte",
        proposalSentAt: new Date("2026-04-09T12:00:00.000Z"),
        proposalLink: "https://example.com/portal/cliente?email=test@acme.cl",
      },
      { id: "c1", email: "test@acme.cl" },
      "https://example.com/portal/cliente/auth/magic?k=abc",
    );

    expect(enriched.title).toBe("Seguridad Planta Norte");
    expect(enriched.proposalLink).toBe(
      "https://example.com/portal/cliente/auth/magic?k=abc",
    );
    expect(enriched.proposalSentDate).toMatch(/9 de abril de 2026/);
  });
});

describe("followup_first — resolución de tokens deal.*", () => {
  it("reemplaza deal.title, deal.proposalSentDate y deal.proposalLink", () => {
    const body = plainTextToTiptapJson(`Hola {{contact.firstName}}, ¿cómo estás?

Te hago seguimiento a la propuesta de {{deal.title}} enviada el {{deal.proposalSentDate}}.

{{deal.proposalLink}}

Cualquier duda quedo atento. Saludos!`);

    const { resolvedContent } = resolveDocument(body as never, {
      contact: { firstName: "Edgar" },
      deal: enrichDealForWaTemplate(
        {
          title: "Seguridad Planta Norte",
          proposalSentAt: new Date("2026-04-09T12:00:00.000Z"),
        },
        { id: "c1", email: "edgar@acme.cl" },
        "https://example.com/portal/cliente/auth/magic?k=token",
      ),
    });

    const text = tiptapToPlainText(resolvedContent);
    expect(text).toContain("Hola Edgar");
    expect(text).toContain("Seguridad Planta Norte");
    expect(text).toContain("9 de abril de 2026");
    expect(text).toContain("https://example.com/portal/cliente/auth/magic?k=token");
    expect(text).not.toContain("{{deal.");
  });
});

describe("tokens deal.* sin entidad deal", () => {
  it("deja placeholders literales cuando falta entities.deal", () => {
    const body = plainTextToTiptapJson("Propuesta {{deal.title}}");
    const { resolvedContent } = resolveDocument(body as never, {
      contact: { firstName: "Edgar" },
    });
    const text = tiptapToPlainText(resolvedContent);
    expect(text).toContain("{{deal.title}}");
  });
});
