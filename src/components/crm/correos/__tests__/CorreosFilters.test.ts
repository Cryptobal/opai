import { describe, expect, it } from "vitest";
import {
  chipFromFilters,
  countActiveFilters,
  emptyFilterFlags,
  filtersFromChip,
  matchesCorreoFilters,
} from "../CorreosFilters";

describe("CorreosFilters state helpers", () => {
  it("countActiveFilters cuenta asociación + flags", () => {
    expect(countActiveFilters("todos", emptyFilterFlags())).toBe(0);
    expect(countActiveFilters("con_cuenta", emptyFilterFlags())).toBe(1);
    expect(countActiveFilters("todos", new Set(["sin_responder"]))).toBe(1);
    expect(countActiveFilters("sin_asociar", new Set(["sin_responder", "con_adjuntos"]))).toBe(3);
  });

  it("filtersFromChip migra valores legados", () => {
    expect(filtersFromChip("con_cuenta")).toEqual({
      assoc: "con_cuenta",
      flags: emptyFilterFlags(),
    });
    expect(filtersFromChip("sin_responder")).toEqual({
      assoc: "todos",
      flags: new Set(["sin_responder"]),
    });
    expect(filtersFromChip("leads_creados")).toEqual({
      assoc: "todos",
      flags: emptyFilterFlags(),
    });
  });

  it("chipFromFilters deriva shim cuando hay un solo eje", () => {
    expect(chipFromFilters("con_cuenta", emptyFilterFlags())).toBe("con_cuenta");
    expect(chipFromFilters("todos", new Set(["con_adjuntos"]))).toBe("con_adjuntos");
  });

  it("matchesCorreoFilters combina asociación y flags (AND)", () => {
    const t = {
      accountId: "a1",
      slaLevel: "warn" as const,
      attachmentCount: 2,
      leadId: null,
    };
    expect(matchesCorreoFilters(t, "con_cuenta", new Set(["sin_responder", "con_adjuntos"]))).toBe(true);
    expect(matchesCorreoFilters(t, "sin_asociar", emptyFilterFlags())).toBe(false);
    expect(matchesCorreoFilters({ ...t, attachmentCount: 0 }, "todos", new Set(["con_adjuntos"]))).toBe(false);
  });
});
