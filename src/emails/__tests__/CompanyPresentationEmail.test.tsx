import { render } from "@react-email/render";
import { describe, expect, it } from "vitest";
import { CompanyPresentationEmail } from "../CompanyPresentationEmail";

describe("CompanyPresentationEmail", () => {
  it("incluye CTA, enlace directo al portal y aviso del PDF adjunto", async () => {
    const portalUrl =
      "https://gard.cl/portal/cliente?section=presentacion&email=cliente%40acme.cl";
    const email = CompanyPresentationEmail({
      contactName: "Ana Pérez",
      companyName: "ACME Chile",
      email: "cliente@acme.cl",
      pin: "4821",
      portalUrl,
      ejecutivoName: "Ejecutiva Gard",
      brandName: "Gard Security",
    });

    const html = await render(email);
    const text = await render(email, { plainText: true });

    expect(html).toContain("Abrir presentación en el portal");
    expect(html).toContain("presentación comercial en PDF adjunta");
    expect(html).toContain("section=presentacion");
    expect(text).toContain("Abrir presentación en el portal");
    expect(text).toContain("presentación comercial en PDF adjunta");
    expect(text).toContain(portalUrl);
  });
});
