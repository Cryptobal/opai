import type { RondaAnomalyCode } from "@/lib/rondas/anomaly-detection";

export interface CheckpointTrustInput {
  geoValidada: boolean;
  hasPhoto: boolean;
  hasMovement: boolean;
  sameDevice: boolean;
  batteryLevel?: number | null;
  speedFromPrevKmh?: number | null;
}

export function computeCheckpointTrustScore(input: CheckpointTrustInput): number {
  let score = 0;
  score += input.geoValidada ? 30 : 0;
  score += input.hasMovement ? 15 : 0;
  score += input.hasPhoto ? 15 : 0;
  score += input.sameDevice ? 10 : 0;
  score += (input.speedFromPrevKmh ?? 0) <= 15 ? 20 : 0;
  score += (input.batteryLevel ?? 100) > 10 ? 10 : 0;
  return Math.max(0, Math.min(100, score));
}

export function computeRondaTrustScore(scores: number[]): number {
  if (!scores.length) return 0;
  const avg = scores.reduce((acc, v) => acc + v, 0) / scores.length;
  return Math.round(avg);
}

export function trustBand(score: number): "green" | "yellow" | "red" {
  if (score >= 80) return "green";
  if (score >= 60) return "yellow";
  return "red";
}

export function toAlertSeverityFromAnomalies(anomalies: RondaAnomalyCode[]): "info" | "warning" | "critical" {
  if (anomalies.includes("geo_fuera_rango") || anomalies.includes("mismo_punto_repetido")) return "critical";
  if (anomalies.length > 0) return "warning";
  return "info";
}
