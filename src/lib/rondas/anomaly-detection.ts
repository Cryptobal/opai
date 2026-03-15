import { DEFAULT_SPEED_THRESHOLD_KMH } from "./ia-config";

export type RondaAnomalyCode =
  | "sin_movimiento"
  | "velocidad_anomala"
  | "bateria_baja"
  | "bateria_estatica";

export interface DetectAnomaliesInput {
  speedFromPrevKmh?: number | null;
  movementScore?: number | null;
  batteryLevel?: number | null;
  prevBatteryLevel?: number | null;
  speedThresholdKmh?: number;
  movementScoreThreshold?: number;
  batteryLowThreshold?: number;
  batteryStaticMinMinutes?: number;
  elapsedMinutes?: number;
}

export function detectCheckpointAnomalies(input: DetectAnomaliesInput): RondaAnomalyCode[] {
  const anomalies: RondaAnomalyCode[] = [];

  if ((input.speedFromPrevKmh ?? 0) > (input.speedThresholdKmh ?? DEFAULT_SPEED_THRESHOLD_KMH)) anomalies.push("velocidad_anomala");
  if ((input.movementScore ?? 0) < (input.movementScoreThreshold ?? 0.05)) anomalies.push("sin_movimiento");

  if ((input.batteryLevel ?? 100) <= (input.batteryLowThreshold ?? 10)) anomalies.push("bateria_baja");
  if (
    input.batteryLevel != null &&
    input.prevBatteryLevel != null &&
    input.batteryLevel === input.prevBatteryLevel &&
    (input.elapsedMinutes ?? 0) > (input.batteryStaticMinMinutes ?? 10)
  ) {
    anomalies.push("bateria_estatica");
  }

  return anomalies;
}
