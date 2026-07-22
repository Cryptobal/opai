import { describe, expect, it } from "vitest";
import {
  clampCorreoPanelWidth,
  parseCorreosViewPreferences,
} from "../useCorreosViewPreferences";

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

  it("descarta preferencias corruptas o con una forma inválida", () => {
    expect(parseCorreosViewPreferences("{")).toEqual({});
    expect(parseCorreosViewPreferences("null")).toEqual({});
    expect(parseCorreosViewPreferences("[]")).toEqual({});
  });

  it("conserva solo valores válidos", () => {
    expect(
      parseCorreosViewPreferences(
        JSON.stringify({ panelWidth: 640, previewLines: 3, extra: true }),
      ),
    ).toEqual({ panelWidth: 640, previewLines: 3 });
    expect(
      parseCorreosViewPreferences(
        JSON.stringify({ panelWidth: "grande", previewLines: 8 }),
      ),
    ).toEqual({});
  });
});
