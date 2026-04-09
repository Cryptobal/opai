import { DEFAULT_SPEED_THRESHOLD_KMH } from "./ia-config";

export type RondaAnomalyCode =
  | "velocidad_anomala"
  | "bateria_baja"
  | "bateria_estatica";

export interface DetectAnomaliesInput {
  speedFromPrevKmh?: number | null;
  batteryLevel?: number | null;
  prevBatteryLevel?: number | null;
  speedThresholdKmh?: number;
  batteryLowThreshold?: number;
  batteryStaticMinMinutes?: number;
  elapsedMinutes?: number;
}

export function detectCheckpointAnomalies(input: DetectAnomaliesInput): RondaAnomalyCode[] {
  const anomalies: RondaAnomalyCode[] = [];

  if ((input.speedFromPrevKmh ?? 0) > (input.speedThresholdKmh ?? DEFAULT_SPEED_THRESHOLD_KMH)) anomalies.push("velocidad_anomala");

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
