import { describe, expect, it } from "vitest";
import { PLANILLA_VISUAL_STAGES } from "../usePlanillaViewPrefs";

/**
 * La sanitización vive dentro del hook (client-only). Acá documentamos el
 * contrato de migración: v2 = modo color por defecto.
 */
describe("PLANILLA_VISUAL_STAGES", () => {
  it("está en v2 (modo color default)", () => {
    expect(PLANILLA_VISUAL_STAGES).toBe(2);
  });
});
