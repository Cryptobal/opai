import { describe, expect, it } from "vitest";
import { evaluateCondition, evaluateFieldCondition } from "../condition";
import { resolveDocument } from "../token-resolver";

describe("evaluateCondition — operadores", () => {
  const entities = {
    guardia: { isJubilado: "SI", colacion: 12000, email: "a@b.cl", afp: "Habitat" },
    quote: { ipcWeight: 0.5, currency: "UF" },
  };

  it("mantiene == string, > numérico y truthy", () => {
    expect(evaluateCondition('guardia.isJubilado=="SI"', entities)).toBe(true);
    expect(evaluateCondition("quote.ipcWeight>0", entities)).toBe(true);
    expect(evaluateCondition("guardia.email", entities)).toBe(true);
  });

  it("soporta !=, <, >=, <= y vacío", () => {
    expect(evaluateCondition('guardia.afp!="Modelo"', entities)).toBe(true);
    expect(evaluateCondition("guardia.colacion<5000", entities)).toBe(false);
    expect(evaluateCondition("guardia.colacion>=12000", entities)).toBe(true);
    expect(evaluateCondition("guardia.colacion<=12000", entities)).toBe(true);
    expect(evaluateCondition("guardia.phone empty", { guardia: { phone: "" } })).toBe(true);
  });

  it("dato faltante cuenta como NO cumple (salvo empty)", () => {
    expect(evaluateCondition("guardia.missing", entities)).toBe(false);
    expect(evaluateCondition("guardia.missing empty", entities)).toBe(true);
  });
});

describe("evaluateFieldCondition", () => {
  it("boolean SI/NO con == y !=", () => {
    const e = { guardia: { isJubilado: "NO" } };
    expect(evaluateFieldCondition("guardia.isJubilado", "==", "NO", e)).toBe(true);
    expect(evaluateFieldCondition("guardia.isJubilado", "!=", "SI", e)).toBe(true);
  });
});

describe("resolveDocument — conditionalBlock y fila condicional", () => {
  it("elige rama SI o SINO según el guardia", () => {
    const doc = {
      type: "doc",
      content: [
        {
          type: "conditionalBlock",
          attrs: { field: "guardia.isJubilado", op: "==", value: "SI", hasElse: true },
          content: [
            {
              type: "conditionalBranch",
              attrs: { branch: "if" },
              content: [{ type: "paragraph", content: [{ type: "text", text: "JUBILADO" }] }],
            },
            {
              type: "conditionalBranch",
              attrs: { branch: "else" },
              content: [{ type: "paragraph", content: [{ type: "text", text: "ACTIVO" }] }],
            },
          ],
        },
      ],
    };
    const si = resolveDocument(doc, { guardia: { isJubilado: "SI" } });
    const no = resolveDocument(doc, { guardia: { isJubilado: "NO" } });
    expect(JSON.stringify(si.resolvedContent)).toContain("JUBILADO");
    expect(JSON.stringify(si.resolvedContent)).not.toContain("ACTIVO");
    expect(JSON.stringify(no.resolvedContent)).toContain("ACTIVO");
  });

  it("omite fila de tabla cuando la condición no cumple", () => {
    const doc = {
      type: "doc",
      content: [
        {
          type: "table",
          content: [
            {
              type: "tableRow",
              content: [
                { type: "tableCell", content: [{ type: "paragraph", content: [{ type: "text", text: "Base" }] }] },
              ],
            },
            {
              type: "tableRow",
              attrs: { condition: { field: "guardia.colacion", op: ">", value: "0" } },
              content: [
                { type: "tableCell", content: [{ type: "paragraph", content: [{ type: "text", text: "Colación" }] }] },
              ],
            },
          ],
        },
      ],
    };
    const withBono = resolveDocument(doc, { guardia: { colacion: 8000 } });
    const without = resolveDocument(doc, { guardia: { colacion: 0 } });
    expect(JSON.stringify(withBono.resolvedContent)).toContain("Colación");
    expect(JSON.stringify(without.resolvedContent)).not.toContain("Colación");
  });

  it("sigue resolviendo markers {{#if}} legados", () => {
    const doc = {
      type: "doc",
      content: [
        { type: "paragraph", content: [{ type: "text", text: "{{#if guardia.isJubilado==\"SI\"}}" }] },
        { type: "paragraph", content: [{ type: "text", text: "solo jubilado" }] },
        { type: "paragraph", content: [{ type: "text", text: "{{/if}}" }] },
      ],
    };
    const si = resolveDocument(doc, { guardia: { isJubilado: "SI" } });
    const no = resolveDocument(doc, { guardia: { isJubilado: "NO" } });
    expect(JSON.stringify(si.resolvedContent)).toContain("solo jubilado");
    expect(JSON.stringify(no.resolvedContent)).not.toContain("solo jubilado");
  });
});
