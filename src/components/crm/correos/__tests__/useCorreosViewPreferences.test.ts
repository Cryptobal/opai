import { describe, expect, it } from "vitest";
import { clampCorreoPanelWidth } from "../useCorreosViewPreferences";

describe("clampCorreoPanelWidth", () => {
  it("respeta el mínimo legible", () => {
    expect(clampCorreoPanelWidth(200, 1_200)).toBe(420);
  });

  it("limita el panel al 72% del workspace", () => {
    expect(clampCorreoPanelWidth(1_000, 1_000)).toBe(720);
  });

  it("preserva un ancho dentro del rango", () => {
    expect(clampCorreoPanelWidth(580, 1_400)).toBe(580);
  });
});
