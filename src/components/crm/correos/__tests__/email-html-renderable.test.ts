import { describe, expect, it } from "vitest";
import { emailHtmlIsRenderable } from "../email-html-renderable";

describe("emailHtmlIsRenderable", () => {
  it("rechaza vacío", () => {
    expect(emailHtmlIsRenderable("")).toBe(false);
    expect(emailHtmlIsRenderable("   ")).toBe(false);
  });

  it("rechaza HTML solo con br / entidades en blanco", () => {
    expect(emailHtmlIsRenderable('<div dir="ltr"><br></div>')).toBe(false);
    expect(emailHtmlIsRenderable("<p>&nbsp;</p>")).toBe(false);
    expect(emailHtmlIsRenderable("<p>&#160;</p>")).toBe(false);
  });

  it("acepta imagen aunque no haya texto", () => {
    expect(emailHtmlIsRenderable('<img src="/api/x">')).toBe(true);
  });

  it("acepta texto visible", () => {
    expect(emailHtmlIsRenderable("<p>hola</p>")).toBe(true);
  });
});
