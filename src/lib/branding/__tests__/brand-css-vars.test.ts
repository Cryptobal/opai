import { describe, expect, it } from "vitest";
import { brandCssVars } from "../brand-css-vars";

describe("brandCssVars", () => {
  it("devuelve vacío con hex inválido", () => {
    expect(brandCssVars({ accentColor: "nope", primaryColor: "zzz" })).toBe("");
  });

  it("emite --primary y --ring con accent válido", () => {
    const css = brandCssVars({ accentColor: "#FF6B35", primaryColor: "#142033" });
    expect(css).toContain(":root{");
    expect(css).toContain("--primary:");
    expect(css).toContain("--ring:");
    expect(css).toContain(".dark{");
    expect(css).toContain("--ds-surface-0:");
  });

  it("acepta secondary como fallback de accent", () => {
    const css = brandCssVars({ secondaryColor: "#0d9488" });
    expect(css).toContain("--primary:");
  });
});
