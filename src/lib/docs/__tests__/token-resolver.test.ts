import { describe, it, expect } from "vitest";
import {
  resolveTokenValue,
  resolveDocument,
  buildEmpresaEntityData,
  normalizeEmpresaSettingKey,
  mergeEmpresaSettings,
  withInstallationLocationFallback,
} from "../token-resolver";

describe("token-resolver — buildEmpresaEntityData", () => {
  it("maps normalized empresa.* setting keys to entity fields", () => {
    const data = buildEmpresaEntityData([
      { key: "empresa.razonSocial", value: "Gard Security SpA" },
      { key: "empresa.repLegalNombre", value: "Juan Pérez" },
      { key: "empresa.fechaEscrituraPublica", value: "15 de marzo de 2020" },
      { key: "empresa.nombreNotaria", value: "Notaría San Martín" },
      { key: "empresa.repLegalFirma", value: "https://example.com/firma.png" },
    ]);

    expect(data.razonSocial).toBe("Gard Security SpA");
    expect(data.repLegalNombre).toBe("Juan Pérez");
    expect(data.fechaEscrituraPublica).toBe("15 de marzo de 2020");
    expect(data.nombreNotaria).toBe("Notaría San Martín");
    expect(data.firmaRepLegal).toBe("https://example.com/firma.png");
  });

  it("maps keys after stripping empresa:{tenantId}: prefix (new Setting format)", () => {
    const tenantId = "tenant-abc";
    const prefix = `empresa:${tenantId}:`;
    const normalized = [
      { key: `${prefix}empresa.repLegalNombre`, value: "Carlos Ruiz" },
      { key: `${prefix}empresa.fechaEscrituraPublica`, value: "1 de enero de 2019" },
    ].map((s) => ({
      key: s.key.includes(":") ? s.key.replace(prefix, "") : s.key,
      value: s.value,
    }));

    const data = buildEmpresaEntityData(normalized);
    expect(data.repLegalNombre).toBe("Carlos Ruiz");
    expect(data.fechaEscrituraPublica).toBe("1 de enero de 2019");
  });

  it("auto-maps any empresa.* suffix even if not in the hardcoded allowlist", () => {
    const data = buildEmpresaEntityData([
      { key: "empresa.fechaEscrituraPublica", value: "24 de Enero de 2024" },
      { key: "empresa.nombreNotaria", value: "Rolando Prussinger Sepulveda" },
      { key: "empresa.campoNuevo", value: "extra" },
    ]);
    expect(data.fechaEscrituraPublica).toBe("24 de Enero de 2024");
    expect(data.nombreNotaria).toBe("Rolando Prussinger Sepulveda");
    expect(data.campoNuevo).toBe("extra");
  });
});

describe("token-resolver — empresa setting key merge", () => {
  it("strips empresa:{tenantId}: prefix used by Configuración → Empresa", () => {
    const tenantId = "clgard00000000000000001";
    expect(
      normalizeEmpresaSettingKey(
        `empresa:${tenantId}:empresa.fechaEscrituraPublica`,
        tenantId
      )
    ).toBe("empresa.fechaEscrituraPublica");
  });

  it("prefers new-format keys over legacy empresa.* when both exist", () => {
    const tenantId = "clgard00000000000000001";
    const merged = mergeEmpresaSettings(
      tenantId,
      [{ key: `empresa:${tenantId}:empresa.fechaEscrituraPublica`, value: "24 de Enero de 2024" }],
      [{ key: "empresa.razonSocial", value: "Gard SpA" }]
    );
    const data = buildEmpresaEntityData(merged);
    expect(data.fechaEscrituraPublica).toBe("24 de Enero de 2024");
    expect(data.razonSocial).toBe("Gard SpA");
  });

  it("resolves empresa.repLegalNombre token from entity data", () => {
    const value = resolveTokenValue("empresa.repLegalNombre", {
      empresa: { repLegalNombre: "María González" },
    });
    expect(value).toBe("María González");
  });
});

describe("token-resolver — installation city fallback", () => {
  it("uses commune when city is empty", () => {
    const inst = withInstallationLocationFallback({
      city: "",
      commune: "San Bernardo",
      address: "Los suspiros 16690",
    });
    expect(inst.city).toBe("San Bernardo");
  });

  it("keeps an explicit city", () => {
    const inst = withInstallationLocationFallback({
      city: "Santiago",
      commune: "Las Condes",
    });
    expect(inst.city).toBe("Santiago");
  });
});

describe("token-resolver — account tokens", () => {
  it("resolves {{account.legalRepresentativeName}} from flat column", () => {
    const value = resolveTokenValue("account.legalRepresentativeName", {
      account: {
        legalRepresentativeName: "Pedro Martínez",
      },
    });
    expect(value).toBe("Pedro Martínez");
  });

  it("resolves {{account.notaryName}} from flat column", () => {
    const value = resolveTokenValue("account.notaryName", {
      account: { notaryName: "Joaquín Tejos" },
    });
    expect(value).toBe("Joaquín Tejos");
  });

  it("returns empty string when value is null (keeps doc clean, Tiptap-safe)", () => {
    const value = resolveTokenValue("account.legalRepresentativeName", {
      account: { legalRepresentativeName: null },
    });
    expect(value).toBe("");
  });
});

describe("token-resolver — quote.contractMonths precedence", () => {
  it("{{quote.contractMonths}} follows the value passed in (user-set duration)", () => {
    // After the fix, buildQuoteEnrichedData sets contractMonths = quote.contractDuration.
    // Here we simulate that and verify the token reads it directly.
    const value = resolveTokenValue("quote.contractMonths", {
      quote: { contractMonths: 3, contractDuration: 3 },
    });
    expect(value).toBe("3");
  });

  it("{{quote.precioTotal}} uses contractDuration over contractMonths when both present (UF)", () => {
    // contractDuration (user-set) must win over contractMonths (legacy default).
    const value = resolveTokenValue("quote.precioTotal", {
      quote: {
        currency: "UF",
        salePriceUF: "76.91",
        contractDuration: 3,
        contractMonths: 12, // stale legacy default
      },
    });
    // 76.91 × 3 = 230.73 UF
    expect(value).toBe("230.73 UF");
  });

  it("{{quote.contractEndDate}} computes end from start + contractDuration (UTC-safe)", () => {
    const value = resolveTokenValue("quote.contractEndDate", {
      quote: {
        contractStartDate: "2026-04-01",
        contractDuration: 3,
      },
    });
    // 01/04/2026 + 3 meses − 1 día = 30/06/2026
    expect(value).toBe("30/06/2026");
  });

  it("{{quote.contractStartDate}} formats ISO date as dd/MM/yyyy (no TZ drift)", () => {
    const value = resolveTokenValue("quote.contractStartDate", {
      quote: { contractStartDate: "2026-04-01" },
    });
    expect(value).toBe("01/04/2026");
  });
});

describe("token-resolver — resolveDocument contractToken nodes", () => {
  it("resolves embedded contractToken nodes into bold text", () => {
    const doc = {
      type: "doc",
      content: [
        {
          type: "paragraph",
          content: [
            { type: "text", text: "Representante: " },
            {
              type: "contractToken",
              attrs: { tokenKey: "account.legalRepresentativeName", label: "Rep" },
            },
          ],
        },
      ],
    };

    const { resolvedContent, tokenValues } = resolveDocument(doc, {
      account: { legalRepresentativeName: "Pedro Martínez" },
    });

    expect(tokenValues["account.legalRepresentativeName"]).toBe("Pedro Martínez");
    // Token got replaced with text node — the resulting paragraph has 2 children.
    const para = (resolvedContent as any).content[0];
    expect(para.type).toBe("paragraph");
    const replacement = para.content.find(
      (n: any) => n.type === "text" && n.text === "Pedro Martínez"
    );
    expect(replacement).toBeTruthy();
  });

  it("preserves unresolved token node when value is empty (badge still visible)", () => {
    const doc = {
      type: "doc",
      content: [
        {
          type: "paragraph",
          content: [
            {
              type: "contractToken",
              attrs: { tokenKey: "account.legalRepresentativeName", label: "Rep" },
            },
          ],
        },
      ],
    };

    const { resolvedContent } = resolveDocument(doc, {
      account: { legalRepresentativeName: null },
    });

    const para = (resolvedContent as any).content[0];
    // When the token has no value, we keep the original node so the editor
    // renders a visible "missing data" badge instead of corrupting the doc.
    expect(para.content[0].type).toBe("contractToken");
  });

  it("fills tenant personería tokens from empresa settings (fecha + notaría)", () => {
    const data = buildEmpresaEntityData([
      { key: "empresa.fechaEscrituraPublica", value: "24 de Enero de 2024" },
      { key: "empresa.nombreNotaria", value: "Rolando Prussinger Sepulveda" },
    ]);
    const doc = {
      type: "doc",
      content: [
        {
          type: "paragraph",
          content: [
            { type: "text", text: "escritura pública de fecha " },
            {
              type: "contractToken",
              attrs: { tokenKey: "empresa.fechaEscrituraPublica", label: "empresa.fechaEscrituraPublica" },
            },
            { type: "text", text: ", otorgada ante " },
            {
              type: "contractToken",
              attrs: { tokenKey: "empresa.nombreNotaria", label: "empresa.nombreNotaria" },
            },
          ],
        },
      ],
    };

    const { resolvedContent, tokenValues } = resolveDocument(doc, { empresa: data });
    expect(tokenValues["empresa.fechaEscrituraPublica"]).toBe("24 de Enero de 2024");
    expect(tokenValues["empresa.nombreNotaria"]).toBe("Rolando Prussinger Sepulveda");

    const texts = (resolvedContent as any).content[0].content
      .filter((n: any) => n.type === "text")
      .map((n: any) => n.text);
    expect(texts).toContain("24 de Enero de 2024");
    expect(texts).toContain("Rolando Prussinger Sepulveda");
    expect((resolvedContent as any).content[0].content.some((n: any) => n.type === "contractToken")).toBe(false);
  });
});
