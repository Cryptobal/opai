import { describe, expect, it } from "vitest";

import {
  resolveFunctionalIntent,
  shouldUseInferredAnswerUpfront,
} from "@/lib/ai/help-chat-intents";

const BASE_URL = "https://app.example.com";

describe("preguntas meta / de seguimiento no caen en plantilla de módulo", () => {
  // Caso reportado: tras crear una instalación, el usuario pregunta por qué el
  // bot eligió ese nombre. La palabra "como" + el scorer difuso hacían que se
  // sirviera la plantilla de "Ops > Turnos extra" sin pasar por el LLM.
  const casoReportado = "y por que le pusiste como nombre brujula?";

  it("no sirve la plantilla upfront para el caso reportado", () => {
    expect(shouldUseInferredAnswerUpfront(casoReportado)).toBe(false);
  });

  it("no resuelve una plantilla de módulo para el caso reportado", () => {
    expect(resolveFunctionalIntent(casoReportado, BASE_URL)).toBeNull();
  });

  it.each([
    "por que hiciste eso?",
    "por que creaste esa instalacion?",
    "por que le pusiste ese nombre",
    "porque elegiste ese cliente",
    "por que la nombraste asi?",
  ])("trata '%s' como seguimiento (no navegación)", (mensaje) => {
    expect(shouldUseInferredAnswerUpfront(mensaje)).toBe(false);
    expect(resolveFunctionalIntent(mensaje, BASE_URL)).toBeNull();
  });

  it("no rompe preguntas funcionales legítimas", () => {
    // Estas SÍ deben resolver navegación/plantilla como antes.
    expect(resolveFunctionalIntent("como registro un turno extra", BASE_URL)).not.toBeNull();
    expect(shouldUseInferredAnswerUpfront("donde esta la pauta mensual")).toBe(true);
  });
});
