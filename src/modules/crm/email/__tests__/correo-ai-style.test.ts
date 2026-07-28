import { describe, expect, it } from "vitest";
import {
  DEFAULT_CORREO_AI_STYLE,
  buildStyleGuide,
  parseCorreoAiStyle,
} from "../correo-ai-style";

describe("parseCorreoAiStyle", () => {
  it("devuelve defaults ante entrada inválida", () => {
    expect(parseCorreoAiStyle(null)).toEqual(DEFAULT_CORREO_AI_STYLE);
    expect(parseCorreoAiStyle({ closeness: "xyz", addressing: 1 })).toEqual(
      DEFAULT_CORREO_AI_STYLE,
    );
  });

  it("recorta guidance y avoidWords", () => {
    const parsed = parseCorreoAiStyle({
      closeness: "formal",
      addressing: "usted",
      length: "detallada",
      guidance: "x".repeat(2000),
      avoidWords: ["a".repeat(50), "", ...Array.from({ length: 40 }, (_, i) => `w${i}`)],
    });
    expect(parsed.closeness).toBe("formal");
    expect(parsed.guidance?.length).toBe(1200);
    expect(parsed.avoidWords).toHaveLength(30);
    expect(parsed.avoidWords[0]?.length).toBe(40);
  });
});

describe("buildStyleGuide", () => {
  it("devuelve vacío con el default (prompt histórico intacto)", () => {
    expect(buildStyleGuide(DEFAULT_CORREO_AI_STYLE)).toBe("");
    expect(buildStyleGuide(null)).toBe("");
    expect(buildStyleGuide(undefined)).toBe("");
  });

  it("incluye prohibiciones y extensión cuando difiere del default", () => {
    const guide = buildStyleGuide({
      closeness: "cercano",
      addressing: "nombre",
      length: "breve",
      avoidWords: ["Estimado"],
      guidance: "Abrí por el nombre",
    });
    expect(guide).toContain("máximo 90 palabras");
    expect(guide).toContain("Estimado");
    expect(guide).toContain("Abrí por el nombre");
    expect(guide).toContain("No escribas asunto ni firma");
  });
});
