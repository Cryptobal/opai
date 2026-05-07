import { describe, it, expect } from "vitest";
import {
  hasLegacyWaPlaceholders,
  migrateLegacyPlaceholdersInText,
  migrateLegacyPlaceholdersInTiptap,
} from "../wa-template-migrations";
import { resolveDocument, tiptapToPlainText } from "../token-resolver";

const tiptapOf = (lines: string[]) => ({
  type: "doc",
  content: lines.map((line) =>
    line === ""
      ? { type: "paragraph", content: [] }
      : { type: "paragraph", content: [{ type: "text", text: line }] },
  ),
});

describe("wa-template-migrations — text-level", () => {
  it("migrates lead_commercial single-word placeholders", () => {
    const input =
      "Hola {nombre}, ¿cómo estás?\n\n" +
      "Recibimos tu solicitud para {empresa}, ubicada en {direccion}.\n\n" +
      "Servicio: {servicio} | Dotación: {dotacion}\n\n{website}";
    const out = migrateLegacyPlaceholdersInText(input, "lead_commercial");
    expect(out).toBe(
      "Hola {{lead.firstName}}, ¿cómo estás?\n\n" +
        "Recibimos tu solicitud para {{lead.companyName}}, ubicada en {{lead.address}}.\n\n" +
        "Servicio: {{lead.serviceLabel}} | Dotación: {{lead.dotacionResumen}}\n\n{{tenant.website}}",
    );
  });

  it("migrates lead_client single-word placeholders", () => {
    const out = migrateLegacyPlaceholdersInText(
      "Hola, soy {nombre} {apellido} de {empresa}.\n\n{maps_link}",
      "lead_client",
    );
    expect(out).toBe(
      "Hola, soy {{lead.firstName}} {{lead.lastName}} de {{lead.companyName}}.\n\n{{system.mapsLink}}",
    );
  });

  it("migrates followup_first single-word placeholders", () => {
    const out = migrateLegacyPlaceholdersInText(
      "Hola {contactName}, seguimiento de {dealTitle} ({proposalSentDate}): {proposalLink}",
      "followup_first",
    );
    expect(out).toBe(
      "Hola {{contact.firstName}}, seguimiento de {{deal.title}} ({{deal.proposalSentDate}}): {{deal.proposalLink}}",
    );
  });

  it("upgrades {module.field} to {{module.field}} regardless of slug", () => {
    const out = migrateLegacyPlaceholdersInText(
      "Estimado/a {contact.firstName}, propuesta {deal.title} de {account.name}: {deal.proposalLink}",
    );
    expect(out).toBe(
      "Estimado/a {{contact.firstName}}, propuesta {{deal.title}} de {{account.name}}: {{deal.proposalLink}}",
    );
  });

  it("does not double-wrap already-resolved tokens", () => {
    const input = "Hola {{lead.firstName}}, queda {{tenant.website}}";
    expect(migrateLegacyPlaceholdersInText(input, "lead_commercial")).toBe(input);
  });

  it("ignores unknown single-word placeholders for the slug", () => {
    const out = migrateLegacyPlaceholdersInText(
      "Hola {nombre}, código {custom} no debe tocarse",
      "lead_commercial",
    );
    expect(out).toBe("Hola {{lead.firstName}}, código {custom} no debe tocarse");
  });

  it("hasLegacyWaPlaceholders detects WA single-word for given slug", () => {
    expect(hasLegacyWaPlaceholders("Hola {nombre}", "lead_commercial")).toBe(true);
    expect(hasLegacyWaPlaceholders("Hola {{lead.firstName}}", "lead_commercial")).toBe(false);
    expect(hasLegacyWaPlaceholders("Hola {custom}", "lead_commercial")).toBe(false);
  });

  it("hasLegacyWaPlaceholders detects bare {module.field} without slug", () => {
    expect(hasLegacyWaPlaceholders("Hola {contact.firstName}")).toBe(true);
    expect(hasLegacyWaPlaceholders("Hola {{contact.firstName}}")).toBe(false);
  });
});

describe("wa-template-migrations — Tiptap-level", () => {
  it("migrates text nodes and reports changed=true", () => {
    const doc = tiptapOf(["Hola {nombre}", "Empresa: {empresa}"]);
    const { migrated, changed } = migrateLegacyPlaceholdersInTiptap(doc, "lead_commercial");
    expect(changed).toBe(true);
    const text = tiptapToPlainText(migrated as never);
    expect(text).toContain("{{lead.firstName}}");
    expect(text).toContain("{{lead.companyName}}");
  });

  it("changed=false when nothing to migrate", () => {
    const doc = tiptapOf(["Hola {{lead.firstName}}"]);
    const { migrated, changed } = migrateLegacyPlaceholdersInTiptap(doc, "lead_commercial");
    expect(changed).toBe(false);
    expect(migrated).toBe(doc);
  });

  it("upgrades href on a link mark from {deal.proposalLink} to {{deal.proposalLink}}", () => {
    const doc = {
      type: "doc",
      content: [
        {
          type: "paragraph",
          content: [
            {
              type: "text",
              text: "Ver propuesta",
              marks: [{ type: "link", attrs: { href: "{deal.proposalLink}" } }],
            },
          ],
        },
      ],
    };
    const { migrated, changed } = migrateLegacyPlaceholdersInTiptap(doc, "followup_first");
    expect(changed).toBe(true);
    const href = (migrated as any).content[0].content[0].marks[0].attrs.href;
    expect(href).toBe("{{deal.proposalLink}}");
  });
});

describe("wa-template-migrations — end-to-end con resolver", () => {
  it("post-migration, el resolver pinta el lead real (caso Gard)", () => {
    const oldBody = tiptapOf([
      "Hola {nombre}, ¿cómo estás?",
      "",
      "Recibimos tu solicitud de cotización para {empresa}, ubicada en {direccion}.",
      "",
      "Servicio: {servicio} | Dotación: {dotacion}",
      "",
      "{website}",
    ]);
    const { migrated } = migrateLegacyPlaceholdersInTiptap(oldBody, "lead_commercial");
    const { resolvedContent } = resolveDocument(migrated, {
      lead: {
        firstName: "Juan",
        companyName: "Acme S.A.",
        address: "Av. Apoquindo 4500, Las Condes, Santiago",
        serviceLabel: "Guardias de Seguridad",
        dotacionResumen: "Diurno: 2 guardia(s); Nocturno: 1 guardia(s)",
      },
      tenant: { website: "https://gard.cl" },
    });
    const text = tiptapToPlainText(resolvedContent);
    expect(text).toContain("Hola Juan");
    expect(text).toContain("Acme S.A.");
    expect(text).toContain("Av. Apoquindo 4500");
    expect(text).toContain("Guardias de Seguridad");
    expect(text).toContain("Diurno: 2 guardia(s)");
    expect(text).toContain("https://gard.cl");
    expect(text).not.toContain("{nombre}");
    expect(text).not.toContain("{empresa}");
  });
});
