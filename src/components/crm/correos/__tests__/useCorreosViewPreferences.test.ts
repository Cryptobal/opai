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

  it("acepta una configuración de swipe válida", () => {
    expect(
      parseCorreosViewPreferences(
        JSON.stringify({
          swipeConfig: { right: ["star", "reply"], left: ["snooze", "read"] },
        }),
      ),
    ).toEqual({
      swipeConfig: { right: ["star", "reply"], left: ["snooze", "read"] },
    });
  });

  it("descarta configuraciones de swipe con valores inválidos", () => {
    // Acción fuera del union.
    expect(
      parseCorreosViewPreferences(
        JSON.stringify({
          swipeConfig: { right: ["archive", "delete"], left: ["trash", "read"] },
        }),
      ),
    ).toEqual({});
    // Aridad incorrecta y formas no-array.
    expect(
      parseCorreosViewPreferences(
        JSON.stringify({ swipeConfig: { right: ["archive"], left: ["trash", "read"] } }),
      ),
    ).toEqual({});
    expect(
      parseCorreosViewPreferences(
        JSON.stringify({ swipeConfig: { right: "archive", left: ["trash", "read"] } }),
      ),
    ).toEqual({});
    // Un lado inválido descarta el config completo sin tocar el resto.
    expect(
      parseCorreosViewPreferences(
        JSON.stringify({
          previewLines: 1,
          swipeConfig: { right: ["archive", "snooze"], left: null },
        }),
      ),
    ).toEqual({ previewLines: 1 });
  });

  it("sin swipeConfig guardado no inventa uno (el hook aplica los defaults)", () => {
    expect(
      parseCorreosViewPreferences(JSON.stringify({ panelWidth: 640 })),
    ).toEqual({ panelWidth: 640 });
  });
});
