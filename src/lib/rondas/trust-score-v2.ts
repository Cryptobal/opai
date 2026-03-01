import type { OpsRondaEjecucion, OpsMarcacionCheckpoint, OpsRondaTemplate, OpsRondaProgramacion, OpsRondaCheckpoint } from "@prisma/client";

export interface TrustScoreBreakdown {
  completion: { score: number; weight: number; detail: string };
  time: { score: number; weight: number; detail: string };
  speed: { score: number; weight: number };
  sequence: { score: number; weight: number };
  punctuality: { score: number; weight: number };
}

export interface TrustScoreResult {
  score: number;
  breakdown: TrustScoreBreakdown;
}

export function calculateRondaTrustScore(input: {
  ejecucion: Pick<OpsRondaEjecucion, "startedAt" | "completedAt" | "scheduledAt" | "checkpointsTotal">;
  marcaciones: Pick<OpsMarcacionCheckpoint, "status" | "timestamp" | "checkpointId">[];
  template: Pick<OpsRondaTemplate, "estimatedDurationMin" | "orderMode">;
  templateCheckpoints?: Pick<OpsRondaCheckpoint, "checkpointId" | "orderIndex">[];
  programacion?: Pick<OpsRondaProgramacion, "toleranciaMinutos"> | null;
}): TrustScoreResult {
  const { ejecucion, marcaciones, template, templateCheckpoints, programacion } = input;

  const completedMarks = marcaciones.filter(m => m.status === "COMPLETED");
  const total = ejecucion.checkpointsTotal || marcaciones.length;

  // 1. COMPLETION (30%)
  const completionRatio = total > 0 ? completedMarks.length / total : 0;
  const completionScore = Math.round(completionRatio * 100);

  // 2. TIME (20%)
  const expectedMin = template.estimatedDurationMin || (total * 8);
  let durationMin = 0;
  if (ejecucion.startedAt && ejecucion.completedAt) {
    durationMin = (new Date(ejecucion.completedAt).getTime() - new Date(ejecucion.startedAt).getTime()) / 60000;
  }
  const timeDeviation = expectedMin > 0 ? Math.abs(durationMin - expectedMin) / expectedMin : 0;
  const timeScore = Math.round(Math.max(0, 100 - timeDeviation * 100));

  // 3. SPEED CONSISTENCY (20%)
  const sorted = completedMarks
    .filter(m => m.timestamp)
    .sort((a, b) => new Date(a.timestamp).getTime() - new Date(b.timestamp).getTime());

  let speedScore = 100;
  if (sorted.length >= 2) {
    const intervals: number[] = [];
    for (let i = 1; i < sorted.length; i++) {
      intervals.push(
        (new Date(sorted[i].timestamp).getTime() - new Date(sorted[i - 1].timestamp).getTime()) / 60000,
      );
    }
    const avg = intervals.reduce((a, b) => a + b, 0) / intervals.length;
    const variance = intervals.reduce((s, v) => s + Math.pow(v - avg, 2), 0) / intervals.length;
    const cv = avg > 0 ? variance / (avg * avg) : 0;
    speedScore = Math.round(Math.max(0, 100 - cv * 200));
  }

  // 4. SEQUENCE (15%)
  let sequenceScore = 100;
  if (template.orderMode === "strict" && templateCheckpoints && sorted.length > 1) {
    const expectedOrder = [...templateCheckpoints].sort((a, b) => a.orderIndex - b.orderIndex);
    const actualOrder = sorted.map(m => m.checkpointId);
    let matches = 0;
    for (let i = 0; i < Math.min(actualOrder.length, expectedOrder.length); i++) {
      if (actualOrder[i] === expectedOrder[i].checkpointId) matches++;
    }
    const denominator = Math.max(actualOrder.length, expectedOrder.length);
    sequenceScore = denominator > 0 ? Math.round((matches / denominator) * 100) : 100;
  }

  // 5. PUNCTUALITY (15%)
  let punctualityScore = 100;
  if (ejecucion.scheduledAt && ejecucion.startedAt) {
    const delayMin = (new Date(ejecucion.startedAt).getTime() - new Date(ejecucion.scheduledAt).getTime()) / 60000;
    const tolerance = programacion?.toleranciaMinutos ?? 10;
    const excessDelay = Math.max(0, delayMin - tolerance);
    punctualityScore = Math.round(Math.max(0, 100 - excessDelay * 5));
  }

  const score = Math.min(100, Math.max(0, Math.round(
    completionScore * 0.30 +
    timeScore * 0.20 +
    speedScore * 0.20 +
    sequenceScore * 0.15 +
    punctualityScore * 0.15,
  )));

  return {
    score,
    breakdown: {
      completion: { score: completionScore, weight: 0.30, detail: `${completedMarks.length}/${total}` },
      time: { score: timeScore, weight: 0.20, detail: `${Math.round(durationMin)}/${expectedMin} min` },
      speed: { score: speedScore, weight: 0.20 },
      sequence: { score: sequenceScore, weight: 0.15 },
      punctuality: { score: punctualityScore, weight: 0.15 },
    },
  };
}
