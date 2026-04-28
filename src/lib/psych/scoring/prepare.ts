/**
 * Prepara los buckets de datos que consume el orquestador de scoring a partir
 * de un assessment cargado con responses + items. Extraído de index.ts para
 * mantener el orquestador bajo 145 líneas.
 */

import type { PsychDimension } from "../constants";
import type { ScoredResponse } from "../types";
import { normalizeResponse } from "./normalize";
import type { LikertSample } from "./detectors";

export interface LoadedAssessmentResponse {
  itemId: string;
  value: unknown;
  latencyMs: number | null;
}

export interface LoadedAssessmentItem {
  id: string;
  order: number;
  type: "LIKERT" | "SJT" | "COGNITIVE" | "OPEN" | "LIE";
  dimension: string;
  prompt: string;
  scoringKey: unknown;
  reverseScore: boolean;
  weight: number;
  minLatencyMs: number;
}

export interface OpenToAnalyze {
  itemId: string;
  prompt: string;
  text: string;
  dimensions: PsychDimension[];
}

export interface PreparedBuckets {
  scoredResponses: ScoredResponse[];
  likertSamples: LikertSample[];
  lieInputs: Array<{
    value: unknown;
    extremeValues: number[];
    weights?: Record<number, number>;
  }>;
  lieHits: Array<{ itemId: string; value: number }>;
  latencyRows: Array<{
    itemId: string;
    latencyMs: number | null;
    minLatencyMs: number;
  }>;
  openToAnalyze: OpenToAnalyze[];
  responsesById: Map<string, unknown>;
}

function extractOpenText(value: unknown): string {
  if (typeof value === "string") return value;
  if (
    typeof value === "object" &&
    value !== null &&
    "value" in value &&
    typeof (value as { value: unknown }).value === "string"
  ) {
    return (value as { value: string }).value;
  }
  return "";
}

export function prepareBuckets(
  responses: LoadedAssessmentResponse[],
  items: Map<string, LoadedAssessmentItem>,
): PreparedBuckets {
  const out: PreparedBuckets = {
    scoredResponses: [],
    likertSamples: [],
    lieInputs: [],
    lieHits: [],
    latencyRows: [],
    openToAnalyze: [],
    responsesById: new Map(),
  };

  for (const resp of responses) {
    const item = items.get(resp.itemId);
    if (!item) continue;

    out.latencyRows.push({
      itemId: item.id,
      latencyMs: resp.latencyMs,
      minLatencyMs: item.minLatencyMs,
    });
    out.responsesById.set(item.id, resp.value);

    if (item.type === "OPEN") {
      const rubric = item.scoringKey as { dimensions?: PsychDimension[] };
      out.openToAnalyze.push({
        itemId: item.id,
        prompt: item.prompt,
        text: extractOpenText(resp.value),
        dimensions: rubric.dimensions ?? [],
      });
      continue;
    }

    const normalized = normalizeResponse(
      item.type as "LIKERT" | "SJT" | "COGNITIVE" | "LIE",
      resp.value,
      item.scoringKey as never,
      item.reverseScore,
    );

    const dim =
      item.type === "LIE" ? null : (item.dimension as PsychDimension);

    out.scoredResponses.push({
      itemId: item.id,
      dimension: dim,
      type: item.type,
      normalizedScore: normalized,
      weight: item.weight,
      latencyMs: resp.latencyMs,
      minLatencyMs: item.minLatencyMs,
      fastLatency:
        resp.latencyMs != null && resp.latencyMs < item.minLatencyMs,
    });

    if (item.type === "LIKERT") {
      const raw = Number(
        (resp.value as { value?: unknown })?.value ?? resp.value,
      );
      if (Number.isFinite(raw)) {
        out.likertSamples.push({ value: raw, itemOrder: item.order });
      }
    }
    if (item.type === "LIE") {
      const key = item.scoringKey as {
        extremePositiveValues?: number[];
        weights?: Record<number, number>;
      };
      const extreme = key.extremePositiveValues ?? [4, 5];
      out.lieInputs.push({
        value: resp.value,
        extremeValues: extreme,
        weights: key.weights,
      });
      const v = Number(
        (resp.value as { value?: unknown })?.value ?? resp.value,
      );
      if (Number.isFinite(v) && extreme.includes(v)) {
        out.lieHits.push({ itemId: item.id, value: v });
      }
    }
  }

  return out;
}
