/**
 * 4 ítems VOCATIONAL_FIT (pasión por la seguridad).
 * Diseñados para evitar deseabilidad social — no preguntan "te gusta este trabajo"
 * sino qué harías ante alternativas / cómo describes el oficio.
 */

import type { OpenScoringKey } from "@/lib/psych/types";
import type { SeedItem } from "./v1-shared";
import { sjt } from "./v1-items-sjt-helper";

export const ITEMS_VOCATIONAL_V1_1: SeedItem[] = [
  sjt({
    order: 46,
    dimension: "VOCATIONAL_FIT",
    prompt:
      "Te ofrecen un trabajo administrativo con sueldo similar pero sin guardia. ¿Qué haces?",
    best: "B",
    alternatives: [
      { value: "A", label: "Acepto inmediatamente, prefiero estar dentro de una oficina.", score: 0.1 },
      { value: "B", label: "Lo evalúo, pero me gusta el trabajo de seguridad porque siento que aporto al cuidado de las personas; me quedo si las condiciones son comparables.", score: 1.0 },
      { value: "C", label: "Dejo guardia sin pensarlo, todo trabajo de oficina es mejor.", score: 0.0 },
      { value: "D", label: "Acepto y trabajo en ambos por un tiempo mientras decido.", score: 0.4 },
    ],
  }),
  sjt({
    order: 47,
    dimension: "VOCATIONAL_FIT",
    prompt:
      "En tu primera semana descubres que el rol exige más estudio del que pensabas (protocolos, primeros auxilios, defensa personal). ¿Cómo lo tomas?",
    best: "A",
    alternatives: [
      { value: "A", label: "Me motiva, prefiero estar bien preparado para situaciones reales.", score: 1.0 },
      { value: "B", label: "Lo hago porque toca, aunque preferiría menos teoría.", score: 0.5 },
      { value: "C", label: "Estudio lo mínimo para aprobar y pasar el curso.", score: 0.2 },
      { value: "D", label: "Renuncio, era para algo más simple.", score: 0.0 },
    ],
  }),
  sjt({
    order: 48,
    dimension: "VOCATIONAL_FIT",
    prompt:
      "Un familiar te dice que ser guardia 'es trabajo de poco valor'. ¿Cómo respondes?",
    best: "C",
    alternatives: [
      { value: "A", label: "Le doy la razón, es un trabajo más mientras encuentro otra cosa.", score: 0.1 },
      { value: "B", label: "Le digo que no opine si no sabe.", score: 0.3 },
      { value: "C", label: "Le explico que ser guardia significa proteger personas, prevenir delitos y mantener la calma cuando otros pierden el control — es un oficio con responsabilidad real.", score: 1.0 },
      { value: "D", label: "No le respondo y cambio de tema.", score: 0.4 },
    ],
  }),
  {
    order: 49,
    type: "OPEN",
    dimension: "VOCATIONAL_FIT",
    prompt:
      "Cuéntanos en tus palabras qué te llevó a postular como guardia y qué es lo que más valoras del oficio. ¿Te imaginas haciendo esto en 5 años? (mínimo 4 líneas, ~120 palabras)",
    options: null,
    scoringKey: {
      kind: "open",
      rubric: "ai_analysis",
      dimensions: ["VOCATIONAL_FIT"],
    } satisfies OpenScoringKey,
    weight: 1.5,
    minLatencyMs: 30_000,
    maxLatencyMs: 600_000,
  },
];
