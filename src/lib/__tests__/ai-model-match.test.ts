import { describe, expect, it } from "vitest";
import { modelBelongsToProvider } from "../ai-model-match";

describe("modelBelongsToProvider", () => {
  it("acepta modelos del proveedor correcto", () => {
    expect(modelBelongsToProvider("gpt-4o-mini", "openai")).toBe(true);
    expect(modelBelongsToProvider("o3-mini", "openai")).toBe(true);
    expect(modelBelongsToProvider("claude-haiku-4-5-20251001", "anthropic")).toBe(true);
    expect(modelBelongsToProvider("gemini-2.0-flash", "google")).toBe(true);
  });

  it("rechaza modelos de otro proveedor (evita 'model not found')", () => {
    expect(modelBelongsToProvider("gpt-4o-mini", "anthropic")).toBe(false);
    expect(modelBelongsToProvider("gpt-4o-mini", "google")).toBe(false);
    expect(modelBelongsToProvider("claude-sonnet-4-5", "openai")).toBe(false);
    expect(modelBelongsToProvider("gemini-2.0-pro", "anthropic")).toBe(false);
  });

  it("rechaza proveedor desconocido", () => {
    expect(modelBelongsToProvider("gpt-4o-mini", "azure")).toBe(false);
  });
});
