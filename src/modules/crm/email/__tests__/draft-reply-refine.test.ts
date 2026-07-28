import { describe, expect, it } from "vitest";
import {
  DRAFT_REFINE_CHIPS,
  DRAFT_REFINE_INSTRUCTIONS,
  isDraftRefineMode,
} from "../draft-reply-refine";

describe("draft-reply-refine", () => {
  it("expone los 4 chips canónicos", () => {
    expect(DRAFT_REFINE_CHIPS.map((c) => c.id)).toEqual([
      "formal",
      "friendly",
      "shorten",
      "polish",
    ]);
    for (const chip of DRAFT_REFINE_CHIPS) {
      expect(DRAFT_REFINE_INSTRUCTIONS[chip.id].length).toBeGreaterThan(20);
    }
  });

  it("valida modos desconocidos", () => {
    expect(isDraftRefineMode("formal")).toBe(true);
    expect(isDraftRefineMode("nope")).toBe(false);
    expect(isDraftRefineMode(null)).toBe(false);
  });
});
