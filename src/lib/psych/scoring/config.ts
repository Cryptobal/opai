/**
 * Resuelve TenantPsychConfig a partir del tenantId. Si no existe registro,
 * retorna defaults sin crear fila (la config se persiste al hacer PATCH en el UI).
 */

import { prisma } from "@/lib/prisma";
import {
  DIMENSION_WEIGHT_FIELD,
  PSYCH_DEFAULT_CONFIG,
  PSYCH_DIMENSIONS,
  PSYCH_TEST_CODE,
  PSYCH_TEST_VERSION,
  type PsychDimension,
} from "../constants";
import type { ResolvedTenantPsychConfig } from "../types";

export async function resolveTenantPsychConfig(
  tenantId: string,
): Promise<ResolvedTenantPsychConfig> {
  const cfg = await prisma.tenantPsychConfig.findUnique({
    where: { tenantId },
  });

  const weights = {} as Record<PsychDimension, number>;
  for (const dim of PSYCH_DIMENSIONS) {
    const field = DIMENSION_WEIGHT_FIELD[dim];
    weights[dim] = cfg ? (cfg[field] as number) : PSYCH_DEFAULT_CONFIG.weights[dim];
  }

  return {
    tenantId,
    weights,
    thresholdFit: cfg?.thresholdFit ?? PSYCH_DEFAULT_CONFIG.thresholdFit,
    thresholdCaution:
      cfg?.thresholdCaution ?? PSYCH_DEFAULT_CONFIG.thresholdCaution,
    requirePsychReview:
      cfg?.requirePsychReview ?? PSYCH_DEFAULT_CONFIG.requirePsychReview,
    invitationTTLHours:
      cfg?.invitationTTLHours ?? PSYCH_DEFAULT_CONFIG.invitationTTLHours,
    brandLogoUrl: cfg?.brandLogoUrl ?? null,
    brandPrimaryColor: cfg?.brandPrimaryColor ?? null,
    defaultVersionCode: cfg?.defaultVersionCode ?? PSYCH_TEST_CODE,
    defaultVersionTag: cfg?.defaultVersionTag ?? PSYCH_TEST_VERSION,
  };
}
