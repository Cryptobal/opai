/**
 * Ítems de cobertura v1.1 para dimensiones con n<5 en v1.0.0.
 * - 2 SJT EMOTIONAL_STABILITY (de 3 → 5)
 * - 1 SJT + 1 COGNITIVE SUSTAINED_ATTENTION (de 3 → 5, con segundo cognitivo no trivial)
 */

import type { CognitiveScoringKey, SjtOption } from "@/lib/psych/types";
import type { SeedItem } from "./v1-shared";
import { sjt } from "./v1-items-sjt-helper";

const opts = (labels: string[]): SjtOption[] =>
  labels.map((label, i) => ({ value: String.fromCharCode(65 + i), label }));

const cogKey = (correct: string): CognitiveScoringKey => ({
  kind: "cognitive",
  correctValue: correct,
});

export const ITEMS_COVERAGE_V1_1: SeedItem[] = [
  sjt({
    order: 50,
    dimension: "EMOTIONAL_STABILITY",
    prompt:
      "Te enteras en pleno turno de que tu pareja terminó la relación por mensaje. ¿Cómo manejas el resto del turno?",
    best: "B",
    alternatives: [
      { value: "A", label: "Pido reemplazo de inmediato porque no puedo concentrarme.", score: 0.3 },
      { value: "B", label: "Termino el turno de forma segura, postergo lo personal y aviso al supervisor para conversarlo después.", score: 1.0 },
      { value: "C", label: "Sigo distraído usando el celular para resolver la situación.", score: 0.1 },
      { value: "D", label: "Abandono el puesto.", score: 0.0 },
    ],
  }),
  sjt({
    order: 51,
    dimension: "EMOTIONAL_STABILITY",
    prompt:
      "Un residente te insulta por motivos personales que nada tienen que ver con tu trabajo. Después se va. ¿Cómo sigues tu jornada?",
    best: "A",
    alternatives: [
      { value: "A", label: "Respiro, dejo registro del incidente y sigo con normalidad.", score: 1.0 },
      { value: "B", label: "Quedo molesto pero igual cumplo, evitando interactuar con todos.", score: 0.5 },
      { value: "C", label: "Le respondo en privado más tarde por redes sociales.", score: 0.0 },
      { value: "D", label: "Le aviso a otros guardias para que también lo traten mal.", score: 0.0 },
    ],
  }),
  sjt({
    order: 52,
    dimension: "SUSTAINED_ATTENTION",
    prompt:
      "Llevas 4 horas vigilando 12 monitores de cámara. Notas que en la cámara 7 hay una persona desde hace 20 minutos sin moverse. ¿Qué haces?",
    best: "C",
    alternatives: [
      { value: "A", label: "Probablemente está esperando a alguien, sigo con la ronda visual.", score: 0.2 },
      { value: "B", label: "Llamo a un compañero para que vaya a verificar y sigo en otra cámara.", score: 0.6 },
      { value: "C", label: "Hago zoom, registro la observación con hora, intento contacto por interfono y aviso al supervisor si no responde.", score: 1.0 },
      { value: "D", label: "Espero otros 10 minutos antes de actuar.", score: 0.3 },
    ],
  }),
  {
    order: 53,
    type: "COGNITIVE",
    dimension: "SUSTAINED_ATTENTION",
    prompt:
      "Lee con atención: 'El vehículo placa BCDF-12 ingresó a las 14:35, salió a las 15:48, y volvió a las 17:02 con dos pasajeros distintos.' ¿Cuántos minutos estuvo dentro la primera vez?",
    options: opts(["73 minutos", "83 minutos", "63 minutos", "1 hora 8 minutos"]),
    scoringKey: cogKey("A"),
    weight: 1.2,
    minLatencyMs: 5_000,
    maxLatencyMs: 90_000,
  },
];
