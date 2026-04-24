/**
 * Construye el overview por contrato para el portal cliente aplicando la
 * política de visibilidad (SEAL / SUMMARY / FULL). Extraído del route.ts
 * para mantenerlo <145 líneas y poder testear fácilmente.
 */

import type { PsychClientReportLevel } from "@prisma/client";
import type { ResolvedTenantPsychConfig } from "./types";

const MS_MONTH = 30 * 24 * 3600 * 1000;

interface GuardRow {
  id: string;
  personaId: string | null;
  currentInstallationId: string | null;
  persona: { firstName: string; lastName: string } | null;
}

interface LastAssessment {
  id: string;
  submittedAt: Date | null;
  result: { band: string } | null;
}

interface ContractConfig {
  reportLevel: PsychClientReportLevel;
  showEvaluationDate: boolean;
  showCoverage: boolean;
  showIndividualSeal: boolean;
  dpaSignedAt: Date | null;
}

export interface ContractOverview {
  contractId: string;
  reportLevel: PsychClientReportLevel;
  degradedFromFull: boolean;
  coverage: {
    totalGuards: number;
    evaluatedGuards: number;
    validAssessments: number;
  };
  assignedGuards: Array<{
    personaId: string | null;
    name: string;
    evaluatedAt: string | null;
    validUntil: string | null;
    isValid: boolean;
  }>;
  distribution?: {
    fit: number;
    caution: number;
    notRecommended: number;
    none: number;
  };
}

export function buildContractOverview(args: {
  contractId: string;
  config: ContractConfig | null;
  tenantCfg: ResolvedTenantPsychConfig;
  guards: GuardRow[];
  lastByPersona: Map<string, LastAssessment>;
  sanitizeGuardName: (first: string, last: string) => string;
}): ContractOverview {
  const { contractId, config, tenantCfg, guards, lastByPersona } = args;

  // Si el contrato no tiene config, usa SEAL con defaults seguros (todo visible
  // a nivel sello pero sin detalle).
  const requested = config?.reportLevel ?? "SEAL";
  const degradedFromFull = requested === "FULL" && !config?.dpaSignedAt;
  const effectiveLevel: PsychClientReportLevel = degradedFromFull
    ? "SEAL"
    : requested;

  const intervalMonths = tenantCfg.reevaluationIntervalMonths ?? 6;
  const intervalMs = intervalMonths * MS_MONTH;
  const now = Date.now();

  let evaluatedCount = 0;
  let validCount = 0;
  const dist = { fit: 0, caution: 0, notRecommended: 0, none: 0 };

  const assignedGuards = guards.map((g) => {
    const last = g.personaId ? lastByPersona.get(g.personaId) : undefined;
    const submittedAt = last?.submittedAt ?? null;
    const validUntil = submittedAt ? new Date(submittedAt.getTime() + intervalMs) : null;
    const isValid = validUntil ? validUntil.getTime() > now : false;

    if (submittedAt) evaluatedCount += 1;
    if (isValid) validCount += 1;

    const band = last?.result?.band;
    if (!band) dist.none += 1;
    else if (band === "FIT") dist.fit += 1;
    else if (band === "FIT_CAUTION") dist.caution += 1;
    else if (band === "NOT_RECOMMENDED") dist.notRecommended += 1;

    return {
      personaId: g.personaId,
      name: args.sanitizeGuardName(
        g.persona?.firstName ?? "",
        g.persona?.lastName ?? "",
      ),
      evaluatedAt:
        config?.showEvaluationDate === false
          ? null
          : submittedAt?.toISOString() ?? null,
      validUntil: validUntil?.toISOString() ?? null,
      isValid,
    };
  });

  const overview: ContractOverview = {
    contractId,
    reportLevel: effectiveLevel,
    degradedFromFull,
    coverage: {
      totalGuards: guards.length,
      evaluatedGuards: evaluatedCount,
      validAssessments: validCount,
    },
    assignedGuards,
  };

  if (effectiveLevel === "SUMMARY") {
    overview.distribution = dist;
  }

  return overview;
}
