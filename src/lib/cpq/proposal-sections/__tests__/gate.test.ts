import { describe, expect, it } from "vitest";
import { licitacionGenerationGate } from "@/modules/crm/documents/licitacion-corpus";

describe("gate de generación de propuesta de licitación", () => {
  it("bloquea sin bases extraídas con mensaje accionable", () => {
    const msg = licitacionGenerationGate(false, null);
    expect(msg).toMatch(/Bases/);
    expect(msg).toMatch(/clasific/i);
  });

  it("permite cuando hay bases", () => {
    expect(licitacionGenerationGate(true, null)).toBeNull();
  });
});
