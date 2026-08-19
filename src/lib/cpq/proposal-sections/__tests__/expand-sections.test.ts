import { describe, expect, it } from "vitest";
import { isAllExpanded, toggleExpandAll, toggleExpandedId } from "../expand-sections";

describe("toggleExpandAll", () => {
  const ids = ["a", "b", "c"];

  it("expand-all abre N", () => {
    const next = toggleExpandAll(ids, new Set());
    expect(next.size).toBe(3);
    expect([...next]).toEqual(ids);
  });

  it("collapse-all deja 0", () => {
    const next = toggleExpandAll(ids, new Set(ids));
    expect(next.size).toBe(0);
  });
});

describe("toggleExpandedId / isAllExpanded", () => {
  it("alterna un id", () => {
    const one = toggleExpandedId(new Set(), "a");
    expect(one.has("a")).toBe(true);
    expect(toggleExpandedId(one, "a").has("a")).toBe(false);
  });

  it("detecta todo expandido", () => {
    expect(isAllExpanded(["a", "b"], new Set(["a", "b"]))).toBe(true);
    expect(isAllExpanded(["a", "b"], new Set(["a"]))).toBe(false);
    expect(isAllExpanded([], new Set())).toBe(false);
  });
});
