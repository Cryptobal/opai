/**
 * 5 LIE (deseabilidad social) + 2 OPEN (scoring vía IA) = 7 ítems.
 * LIE: Likert sobre afirmaciones "perfectas" raramente ciertas.
 * OPEN: escenario libre, rúbrica delegada a ai/analyzeOpen.ts.
 */

import type { OpenScoringKey } from "@/lib/psych/types";
import type { SeedItem } from "./v1-shared";
import { LIKERT_OPTIONS, lieKey } from "./v1-shared";

const lie = (order: number, prompt: string): SeedItem => ({
  order,
  type: "LIE",
  dimension: "LIE",
  prompt,
  options: LIKERT_OPTIONS,
  scoringKey: lieKey(),
  weight: 1.0,
  minLatencyMs: 1_000,
  maxLatencyMs: 45_000,
});

export const ITEMS_LIE_OPEN: SeedItem[] = [
  // ── LIE scale ──
  lie(39, "Nunca en mi vida he mentido, ni siquiera para evitar un problema menor."),
  lie(40, "Siempre devuelvo el vuelto cuando me pagan de más, aunque nadie se dé cuenta."),
  lie(41, "Jamás he sentido rabia hacia un compañero de trabajo."),
  lie(42, "Nunca he llegado un minuto tarde a un compromiso."),
  lie(
    43,
    "Siempre leo de principio a fin cada documento antes de firmarlo, sin excepción.",
  ),

  // ── OPEN ──
  {
    order: 44,
    type: "OPEN",
    dimension: "IMPULSE_CONTROL",
    prompt:
      "Estás solo en tu turno de noche. Un cliente llega muy alterado gritando porque no puede ingresar al edificio por una falla del sistema. Describe con detalle qué harías y por qué actuarías de esa forma (mínimo 3 líneas, unas 100 palabras).",
    options: null,
    scoringKey: {
      kind: "open",
      rubric: "ai_analysis",
      dimensions: ["IMPULSE_CONTROL", "STRESS_MANAGEMENT"],
    } satisfies OpenScoringKey,
    weight: 1.5,
    minLatencyMs: 30_000,
    maxLatencyMs: 600_000,
  },
  {
    order: 45,
    type: "OPEN",
    dimension: "STRESS_MANAGEMENT",
    prompt:
      "Durante una ronda encuentras una situación inesperada: la puerta principal quedó abierta y hay rastros de que entró alguien. El supervisor no contesta. Describe paso a paso qué harías y por qué (mínimo 3 líneas).",
    options: null,
    scoringKey: {
      kind: "open",
      rubric: "ai_analysis",
      dimensions: ["STRESS_MANAGEMENT", "IMPULSE_CONTROL"],
    } satisfies OpenScoringKey,
    weight: 1.5,
    minLatencyMs: 30_000,
    maxLatencyMs: 600_000,
  },
];
