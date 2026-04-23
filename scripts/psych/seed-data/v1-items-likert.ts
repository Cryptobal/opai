/**
 * 20 ítems LIKERT, 2-3 por dimensión. Redacción nivel 6° básico.
 * `direction: negative` → reverseScore al normalizar (ej.: "Pierdo la paciencia
 * fácilmente" puntúa alto en impulsividad, así que bajamos score de control).
 *
 * REVIEW_PSICOLOGO: validar direction y umbrales antes del primer uso real.
 */

import { LIKERT_OPTIONS, likertKey, type SeedItem } from "./v1-shared";

const L = (
  order: number,
  dimension: string,
  prompt: string,
  direction: "positive" | "negative",
): SeedItem => ({
  order,
  type: "LIKERT",
  dimension,
  prompt,
  options: LIKERT_OPTIONS,
  scoringKey: likertKey(direction),
  reverseScore: direction === "negative",
  weight: 1.0,
  minLatencyMs: 800,
  maxLatencyMs: 60_000,
});

export const ITEMS_LIKERT: SeedItem[] = [
  // ── IMPULSE_CONTROL (3) ──
  L(1, "IMPULSE_CONTROL", "Cuando algo me molesta, respondo sin pensar.", "negative"),
  L(2, "IMPULSE_CONTROL", "Me cuesta quedarme callado cuando alguien me falta el respeto.", "negative"),
  L(3, "IMPULSE_CONTROL", "Antes de actuar, pienso las consecuencias.", "positive"),

  // ── FRUSTRATION_TOLERANCE (3) ──
  L(4, "FRUSTRATION_TOLERANCE", "Cuando las cosas no salen como espero, me rindo rápido.", "negative"),
  L(5, "FRUSTRATION_TOLERANCE", "Soy capaz de esperar sin enojarme, aunque demoren mucho en atenderme.", "positive"),
  L(6, "FRUSTRATION_TOLERANCE", "Me desespero cuando tengo que repetir la misma tarea varias veces.", "negative"),

  // ── EMOTIONAL_STABILITY (3) ──
  L(7, "EMOTIONAL_STABILITY", "Mis estados de ánimo cambian fuerte durante el día.", "negative"),
  L(8, "EMOTIONAL_STABILITY", "Me considero una persona tranquila la mayor parte del tiempo.", "positive"),
  L(9, "EMOTIONAL_STABILITY", "Cuando paso un mal rato, tardo mucho en recuperarme.", "negative"),

  // ── STRESS_MANAGEMENT (2) ──
  L(10, "STRESS_MANAGEMENT", "Bajo presión, puedo seguir concentrado en lo que tengo que hacer.", "positive"),
  L(11, "STRESS_MANAGEMENT", "Cuando hay una emergencia me pongo muy nervioso y me cuesta reaccionar.", "negative"),

  // ── SUSTAINED_ATTENTION (2) ──
  L(12, "SUSTAINED_ATTENTION", "Puedo revisar durante horas una lista sin perder la concentración.", "positive"),
  L(13, "SUSTAINED_ATTENTION", "En turnos largos me distraigo fácilmente con el celular o la radio.", "negative"),

  // ── REASONING (2) ──
  L(14, "REASONING", "Me gusta analizar los problemas antes de decidir.", "positive"),
  L(15, "REASONING", "Cuando no entiendo una instrucción, prefiero adivinar en vez de preguntar.", "negative"),

  // ── INTEGRITY (3) ──
  L(16, "INTEGRITY", "Es aceptable ayudar a un amigo a entrar al sitio sin estar autorizado.", "negative"),
  L(17, "INTEGRITY", "Aunque nadie me vea, sigo las reglas del puesto al pie de la letra.", "positive"),
  L(18, "INTEGRITY", "Cumplir un protocolo me parece más importante que quedar bien con un cliente.", "positive"),

  // ── RESPONSIBILITY (2) ──
  L(19, "RESPONSIBILITY", "Llego al turno con al menos 10 minutos de anticipación.", "positive"),
  L(20, "RESPONSIBILITY", "Si estoy cansado, es válido dormir un rato en el turno de noche.", "negative"),
];
