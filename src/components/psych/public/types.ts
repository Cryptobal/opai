/**
 * Tipos del wizard público. No se comparten con el servidor — el servidor usa
 * sus propios tipos en `src/lib/psych/types.ts`. Estos son los que expone
 * `GET /api/public/psych/[token]`.
 */

export interface PublicItem {
  id: string;
  order: number;
  type: "LIKERT" | "SJT" | "COGNITIVE" | "OPEN" | "LIE";
  prompt: string;
  options: Array<{ value: number | string; label: string }> | null;
  minLatencyMs: number;
  maxLatencyMs: number;
}

export interface PublicAssessment {
  id: string;
  status: string;
  startedAt: string | null;
  submittedAt: string | null;
  consentAcceptedAt: string | null;
  expiresAt: string;
  targetName: string;
}

export interface PublicVersion {
  code: string;
  version: string;
  name: string;
  items: PublicItem[];
}

export interface PublicBranding {
  logoUrl: string | null;
  primaryColor: string | null;
}

export interface PublicAnswer {
  itemId: string;
  value: unknown;
  latencyMs: number | null;
}

export interface PublicPayload {
  assessment: PublicAssessment;
  version: PublicVersion;
  responses: PublicAnswer[];
  branding: PublicBranding;
}

export type WizardStage =
  | "LOADING"
  | "WELCOME"
  | "CONSENT"
  | "INSTRUCTIONS"
  | "RUNNING"
  | "SUBMITTING"
  | "DONE"
  | "ERROR";
