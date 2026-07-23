import { describe, it, expect } from "vitest";
import { EXTRACTORS, type ExtractorVertical } from "../extractors";

describe("EXTRACTORS — configuración de extractores bajo demanda", () => {
  it("cada vertical exige su capability de radar", () => {
    expect(EXTRACTORS.operativo.capability).toBe("radar_operaciones");
    expect(EXTRACTORS.rrhh.capability).toBe("radar_rrhh");
    expect(EXTRACTORS.cobranza.capability).toBe("radar_finanzas");
  });

  it("cada extractor tiene feature propio (telemetría separable)", () => {
    const features = (Object.keys(EXTRACTORS) as ExtractorVertical[]).map((v) => EXTRACTORS[v].feature);
    expect(new Set(features).size).toBe(features.length);
    for (const f of features) expect(f).toMatch(/^correo-extract-/);
  });

  it("los system prompts piden SOLO JSON y no inventar datos", () => {
    for (const v of Object.keys(EXTRACTORS) as ExtractorVertical[]) {
      expect(EXTRACTORS[v].system).toMatch(/JSON/);
      expect(EXTRACTORS[v].system.toLowerCase()).toMatch(/no inventes|no inventar/);
    }
  });
});
