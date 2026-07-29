import { describe, expect, it } from "vitest";
import { EXTRACTORS, type ExtractorVertical } from "../extractors";

describe("EXTRACTORS — configuración de extractores bajo demanda", () => {
  it("tiene destinationModule alineado a los comandos del copiloto", () => {
    expect(EXTRACTORS.operativo.destinationModule).toEqual({ module: "ops", submodule: "tickets" });
    expect(EXTRACTORS.rrhh.destinationModule).toEqual({ module: "ops", submodule: "ats" });
    expect(EXTRACTORS.cobranza.destinationModule).toEqual({ module: "finance" });
  });

  it("tiene features distintas por vertical", () => {
    const features = (Object.keys(EXTRACTORS) as ExtractorVertical[]).map((v) => EXTRACTORS[v].feature);
    expect(new Set(features).size).toBe(features.length);
  });

  it("incluye reglas anti-alucinación en el system prompt", () => {
    for (const v of Object.keys(EXTRACTORS) as ExtractorVertical[]) {
      expect(EXTRACTORS[v].system).toMatch(/JSON/);
      expect(EXTRACTORS[v].system.toLowerCase()).toMatch(/no inventes|no inventar/);
    }
  });
});
