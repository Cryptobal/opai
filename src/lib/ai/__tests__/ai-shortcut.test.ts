import { describe, expect, it } from "vitest";
import {
  DEFAULT_AI_SHORTCUT,
  combosEqual,
  formatCombo,
  isReservedCombo,
  matchesShortcut,
  parseCombo,
  serializeCombo,
  validateCombo,
} from "../ai-shortcut";

function keyEvent(partial: Partial<KeyboardEvent> & { key: string }): KeyboardEvent {
  return {
    key: partial.key,
    metaKey: partial.metaKey ?? false,
    ctrlKey: partial.ctrlKey ?? false,
    shiftKey: partial.shiftKey ?? false,
    altKey: partial.altKey ?? false,
    repeat: partial.repeat ?? false,
  } as KeyboardEvent;
}

describe("ai-shortcut", () => {
  it("serializa y parsea combos", () => {
    expect(serializeCombo(DEFAULT_AI_SHORTCUT)).toBe("mod+j");
    expect(parseCombo("mod+shift+k")).toEqual({
      key: "k",
      mod: true,
      shift: true,
      alt: false,
    });
  });

  it("detecta combos reservados", () => {
    expect(isReservedCombo({ key: "k", mod: true })).toBe(true);
    expect(isReservedCombo({ key: "w", mod: true })).toBe(true);
    expect(isReservedCombo({ key: "j", mod: true })).toBe(false);
    expect(isReservedCombo({ key: "k", mod: true, shift: true })).toBe(false);
  });

  it("valida modificador obligatorio y reservados", () => {
    expect(validateCombo({ key: "j", mod: false }).ok).toBe(false);
    expect(validateCombo({ key: "k", mod: true }).ok).toBe(false);
    expect(validateCombo(DEFAULT_AI_SHORTCUT).ok).toBe(true);
  });

  it("matchesShortcut respeta mod/shift y e.repeat", () => {
    expect(
      matchesShortcut(keyEvent({ key: "j", metaKey: true }), DEFAULT_AI_SHORTCUT),
    ).toBe(true);
    expect(
      matchesShortcut(keyEvent({ key: "j", ctrlKey: true }), DEFAULT_AI_SHORTCUT),
    ).toBe(true);
    expect(
      matchesShortcut(keyEvent({ key: "j", metaKey: true, repeat: true }), DEFAULT_AI_SHORTCUT),
    ).toBe(false);
    expect(
      matchesShortcut(
        keyEvent({ key: "k", metaKey: true, shiftKey: true }),
        { key: "k", mod: true, shift: true },
      ),
    ).toBe(true);
  });

  it("combosEqual normaliza case", () => {
    expect(combosEqual({ key: "J", mod: true }, { key: "j", mod: true })).toBe(true);
  });

  it("formatCombo incluye símbolo de modificador", () => {
    const label = formatCombo(DEFAULT_AI_SHORTCUT);
    expect(label.includes("J")).toBe(true);
    expect(label.includes("⌘") || label.toLowerCase().includes("ctrl")).toBe(true);
  });
});
