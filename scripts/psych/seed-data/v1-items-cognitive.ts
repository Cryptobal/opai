/**
 * 3 ítems cognitivos (REASONING + SUSTAINED_ATTENTION).
 * Simples por diseño MVP — detectan desatención, no alta capacidad.
 * REVIEW_PSICOLOGO: si se requiere mayor discriminación, ampliar a 8-10 ítems.
 */

import type { CognitiveScoringKey, SjtOption } from "@/lib/psych/types";
import type { SeedItem } from "./v1-shared";

const opts = (labels: string[]): SjtOption[] =>
  labels.map((label, i) => ({ value: String.fromCharCode(65 + i), label }));

const cogKey = (correct: string): CognitiveScoringKey => ({
  kind: "cognitive",
  correctValue: correct,
});

export const ITEMS_COGNITIVE: SeedItem[] = [
  {
    order: 36,
    type: "COGNITIVE",
    dimension: "REASONING",
    prompt:
      "En una ronda debes revisar 4 puertas (A, B, C, D). Si A está antes de B, B antes de C y C antes de D, ¿en qué orden terminas la ronda?",
    options: opts(["A-B-C-D", "D-C-B-A", "A-C-B-D", "B-A-C-D"]),
    scoringKey: cogKey("A"),
    weight: 1.0,
    minLatencyMs: 3_000,
    maxLatencyMs: 60_000,
  },
  {
    order: 37,
    type: "COGNITIVE",
    dimension: "REASONING",
    prompt:
      "Si tu turno es de 8 horas y ya llevas 5 horas y 20 minutos, ¿cuánto te falta para terminar?",
    options: opts([
      "2 horas 40 minutos",
      "3 horas 20 minutos",
      "2 horas 20 minutos",
      "3 horas 40 minutos",
    ]),
    scoringKey: cogKey("A"),
    weight: 1.0,
    minLatencyMs: 3_000,
    maxLatencyMs: 60_000,
  },
  {
    order: 38,
    type: "COGNITIVE",
    dimension: "SUSTAINED_ATTENTION",
    prompt:
      "Memoriza esta secuencia: 5-9-2-7-3-1-8. ¿Qué número está exactamente entre el 2 y el 1?",
    options: opts(["7-3", "9-7", "3-8", "Sólo el 7 o el 3"]),
    scoringKey: cogKey("A"),
    weight: 1.2,
    minLatencyMs: 4_000,
    maxLatencyMs: 60_000,
  },
];
