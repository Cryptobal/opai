/**
 * Helper de construcción SJT — saca lógica repetitiva de los archivos de datos
 * para que cada archivo v1-items-sjt-*.ts quede <145 líneas.
 */

import type { SjtOption, SjtScoringKey } from "@/lib/psych/types";
import type { SeedItem } from "./v1-shared";

export interface SjtDef {
  order: number;
  dimension: string;
  prompt: string;
  best: string;
  alternatives: { value: string; label: string; score: number }[];
}

export function sjt(def: SjtDef): SeedItem {
  const options: SjtOption[] = def.alternatives.map((a) => ({
    value: a.value,
    label: a.label,
  }));
  const scores: Record<string, number> = {};
  for (const a of def.alternatives) scores[a.value] = a.score;
  const scoringKey: SjtScoringKey = {
    kind: "sjt",
    bestValue: def.best,
    scores,
  };
  return {
    order: def.order,
    type: "SJT",
    dimension: def.dimension,
    prompt: def.prompt,
    options,
    scoringKey,
    reverseScore: false,
    weight: 1.2,
    minLatencyMs: 4_000,
    maxLatencyMs: 180_000,
  };
}
