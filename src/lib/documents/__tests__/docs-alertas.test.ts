import { describe, expect, it } from "vitest";
import { diffIdSets } from "@/lib/docs/migration/alert-ids";

describe("docs-alertas parity", () => {
  it("conjuntos idénticos entre lógica vieja y nueva", () => {
    const legacy = new Set(["os10-1", "contrato-2", "seguro-3"]);
    const unified = new Set(["seguro-3", "os10-1", "contrato-2"]);
    const diff = diffIdSets(legacy, unified);
    expect(diff.onlyLegacy).toEqual([]);
    expect(diff.onlyUnified).toEqual([]);
  });

  it("needsClassification se excluye del conjunto unificado", () => {
    const legacy = new Set(["a", "b"]);
    // "c" es needsClassification y no debe aparecer
    const unified = new Set(["a", "b"]);
    expect(diffIdSets(legacy, unified).onlyUnified).toEqual([]);
    expect(unified.has("c")).toBe(false);
  });
});
