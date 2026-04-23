/**
 * Decide banda FIT / FIT_CAUTION / NOT_RECOMMENDED según umbrales del tenant.
 * Criterios adicionales (lie alto o straight-lining) degradan la banda.
 */

import type { PsychBand } from "@prisma/client";

interface BandInput {
  globalScore: number; // 0..100
  thresholdFit: number;
  thresholdCaution: number;
  highLie: boolean;
  straightLining: boolean;
}

export function decideBand(input: BandInput): PsychBand {
  const { globalScore, thresholdFit, thresholdCaution, highLie, straightLining } =
    input;

  if (highLie || straightLining) {
    // Nunca FIT si la validez está comprometida.
    if (globalScore >= thresholdFit) return "FIT_CAUTION";
  }

  if (globalScore >= thresholdFit) return "FIT";
  if (globalScore >= thresholdCaution) return "FIT_CAUTION";
  return "NOT_RECOMMENDED";
}
