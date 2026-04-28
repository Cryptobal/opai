/**
 * Constantes compartidas del módulo psicolaboral.
 * Cambios en dimensiones o versión afectan scoring y seed.
 */

export const PSYCH_DIMENSIONS = [
  "IMPULSE_CONTROL",
  "FRUSTRATION_TOLERANCE",
  "EMOTIONAL_STABILITY",
  "STRESS_MANAGEMENT",
  "SUSTAINED_ATTENTION",
  "REASONING",
  "INTEGRITY",
  "RESPONSIBILITY",
  "VOCATIONAL_FIT",
] as const;

export type PsychDimension = (typeof PSYCH_DIMENSIONS)[number];

export const PSYCH_DIMENSION_LABELS: Record<PsychDimension, string> = {
  IMPULSE_CONTROL: "Control de impulsos",
  FRUSTRATION_TOLERANCE: "Tolerancia a la frustración",
  EMOTIONAL_STABILITY: "Estabilidad emocional",
  STRESS_MANAGEMENT: "Manejo del estrés",
  SUSTAINED_ATTENTION: "Atención sostenida",
  REASONING: "Razonamiento",
  INTEGRITY: "Integridad",
  RESPONSIBILITY: "Responsabilidad",
  VOCATIONAL_FIT: "Pasión por la seguridad",
};

export const PSYCH_SCORING_VERSION = "1.0.0";
export const PSYCH_TEST_CODE = "security-guard-v1";
export const PSYCH_TEST_VERSION = "1.1.0";

// Key registrado en ALL_MODULES (src/lib/tenant-modules.ts).
export const PSYCH_MODULE_KEY = "psych" as const;

// Duración estimada comunicada al evaluado (minutos).
export const PSYCH_ESTIMATED_MINUTES = 25;

// Flags de calidad detectados durante scoring.
export const PSYCH_FLAGS = {
  STRAIGHT_LINING: "STRAIGHT_LINING",
  HIGH_LIE: "HIGH_LIE",
  FAST_LATENCY: "FAST_LATENCY",
  OPEN_ANALYSIS_FAILED: "OPEN_ANALYSIS_FAILED",
  RED_FLAG_AGGRESSION: "RED_FLAG_AGGRESSION",
  RED_FLAG_INCOHERENT: "RED_FLAG_INCOHERENT",
  RED_FLAG_DISSOCIATION: "RED_FLAG_DISSOCIATION",
} as const;

export type PsychFlag = (typeof PSYCH_FLAGS)[keyof typeof PSYCH_FLAGS];

// Mapea dimensión → campo del TenantPsychConfig.
export const DIMENSION_WEIGHT_FIELD: Record<
  PsychDimension,
  | "weightImpulse"
  | "weightFrustration"
  | "weightStability"
  | "weightStress"
  | "weightAttention"
  | "weightReasoning"
  | "weightIntegrity"
  | "weightResponsibility"
  | "weightVocational"
> = {
  IMPULSE_CONTROL: "weightImpulse",
  FRUSTRATION_TOLERANCE: "weightFrustration",
  EMOTIONAL_STABILITY: "weightStability",
  STRESS_MANAGEMENT: "weightStress",
  SUSTAINED_ATTENTION: "weightAttention",
  REASONING: "weightReasoning",
  INTEGRITY: "weightIntegrity",
  RESPONSIBILITY: "weightResponsibility",
  VOCATIONAL_FIT: "weightVocational",
};

// Defaults de TenantPsychConfig (para cuando no existe registro).
// VOCATIONAL_FIT es opt-in: peso 0.0 hasta que el tenant lo active.
export const PSYCH_DEFAULT_CONFIG = {
  weights: {
    IMPULSE_CONTROL: 1.0,
    FRUSTRATION_TOLERANCE: 1.0,
    EMOTIONAL_STABILITY: 1.0,
    STRESS_MANAGEMENT: 1.0,
    SUSTAINED_ATTENTION: 1.0,
    REASONING: 1.0,
    INTEGRITY: 1.0,
    RESPONSIBILITY: 1.0,
    VOCATIONAL_FIT: 0.0,
  } as Record<PsychDimension, number>,
  thresholdFit: 80,
  thresholdCaution: 60,
  requirePsychReview: false,
  invitationTTLHours: 168,
};
