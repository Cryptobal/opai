import { describe, expect, it } from "vitest";
import {
  assignCorreoShortcut,
  clampCorreoPanelWidth,
  correoReaderBudget,
  normalizeShortcutKey,
  parseCorreosViewPreferences,
} from "../useCorreosViewPreferences";
import { DEFAULT_CORREO_SNOOZE_CONFIG } from "@/modules/crm/email/correo-snooze-presets";

describe("correoReaderBudget", () => {
  it("1440 con riel colapsado sin dock → canSplit", () => {
    const b = correoReaderBudget(1_440, true);
    expect(b.canSplit).toBe(true);
    expect(b.maxReader).toBeGreaterThanOrEqual(420);
  });

  it("728 (1280 con dock) → no alcanza para split", () => {
    const b = correoReaderBudget(728, true);
    // 728 − 68 − 24 − 340 = 296 < 420
    expect(b.maxReader).toBe(296);
    expect(b.canSplit).toBe(false);
  });
});

describe("clampCorreoPanelWidth", () => {
  it("respeta el mínimo legible", () => {
    expect(clampCorreoPanelWidth(200, 1_200)).toBe(420);
  });

  it("reserva mínimo de lista: 1000 → maxReader 568", () => {
    // 1000 − 68 − 24 − 340 = 568
    expect(clampCorreoPanelWidth(1_000, 1_000)).toBe(568);
  });

  it("preserva un ancho dentro del rango", () => {
    expect(clampCorreoPanelWidth(580, 1_400)).toBe(580);
  });

  it("workspaceWidth=0 no clampea (SSR / primer paint)", () => {
    expect(clampCorreoPanelWidth(560, 0)).toBe(560);
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

  it("acepta railCollapsed booleano y descarta otros tipos", () => {
    expect(
      parseCorreosViewPreferences(JSON.stringify({ railCollapsed: true })),
    ).toEqual({ railCollapsed: true });
    expect(
      parseCorreosViewPreferences(JSON.stringify({ railCollapsed: "sí" })),
    ).toEqual({});
  });

  it("mergea atajos guardados sobre los defaults y descarta teclas inválidas", () => {
    const result = parseCorreosViewPreferences(
      JSON.stringify({ shortcuts: { archive: "a", trash: 5, desconocida: "z" } }),
    );
    // 'archive' se sobreescribe; 'trash' inválido (number) conserva default '#';
    // clave desconocida se ignora; el resto queda en default.
    expect(result.shortcuts?.archive).toBe("a");
    expect(result.shortcuts?.trash).toBe("#");
    expect(result.shortcuts?.reply).toBe("r");
    expect((result.shortcuts as Record<string, unknown>)?.desconocida).toBeUndefined();
  });

  it("sin atajos válidos no agrega la clave shortcuts", () => {
    expect(
      parseCorreosViewPreferences(JSON.stringify({ shortcuts: { nada: "x" } })).shortcuts,
    ).toBeUndefined();
    expect(
      parseCorreosViewPreferences(JSON.stringify({ shortcuts: "abc" })).shortcuts,
    ).toBeUndefined();
  });

  it("acepta alwaysShowImages booleano", () => {
    expect(
      parseCorreosViewPreferences(JSON.stringify({ alwaysShowImages: true })),
    ).toEqual({ alwaysShowImages: true });
    expect(
      parseCorreosViewPreferences(JSON.stringify({ alwaysShowImages: 1 })),
    ).toEqual({});
  });

  it("acepta undoSeconds válidos (5/10/15/30) y descarta el resto", () => {
    expect(
      parseCorreosViewPreferences(JSON.stringify({ undoSeconds: 10 })),
    ).toEqual({ undoSeconds: 10 });
    expect(
      parseCorreosViewPreferences(JSON.stringify({ undoSeconds: 7 })),
    ).toEqual({});
    expect(
      parseCorreosViewPreferences(JSON.stringify({ undoSeconds: "10" })),
    ).toEqual({});
  });

  it("acepta snoozeConfig y normaliza inválidos a defaults", () => {
    expect(
      parseCorreosViewPreferences(
        JSON.stringify({
          snoozeConfig: {
            morningHour: 7,
            afternoonHour: 16,
            weekendDay: 0,
            nextWeekDay: 1,
          },
        }),
      ),
    ).toEqual({
      snoozeConfig: {
        morningHour: 7,
        afternoonHour: 16,
        weekendDay: 0,
        nextWeekDay: 1,
      },
    });
    expect(
      parseCorreosViewPreferences(JSON.stringify({ snoozeConfig: { morningHour: 99 } })),
    ).toEqual({ snoozeConfig: DEFAULT_CORREO_SNOOZE_CONFIG });
  });

  it("normaliza letras de atajos a minúscula al parsear", () => {
    const result = parseCorreosViewPreferences(
      JSON.stringify({ shortcuts: { archive: "E", reply: "R" } }),
    );
    expect(result.shortcuts?.archive).toBe("e");
    expect(result.shortcuts?.reply).toBe("r");
  });
});

describe("normalizeShortcutKey", () => {
  it("minúscula letras sueltas", () => {
    expect(normalizeShortcutKey("E")).toBe("e");
    expect(normalizeShortcutKey("r")).toBe("r");
  });

  it("conserva teclas especiales", () => {
    expect(normalizeShortcutKey("Enter")).toBe("Enter");
    expect(normalizeShortcutKey("#")).toBe("#");
    expect(normalizeShortcutKey("/")).toBe("/");
  });
});

describe("assignCorreoShortcut", () => {
  it("libera duplicados restaurando el default en la otra acción", () => {
    const config = {
      down: "j", up: "k", open: "Enter", toggleSelect: "x", archive: "e",
      trash: "#", reply: "q", star: "s", snooze: "b", toggleRead: "u", focusSearch: "/",
    };
    const next = assignCorreoShortcut(config, "archive", "q");
    expect(next.archive).toBe("q");
    expect(next.reply).toBe("r");
  });
});
