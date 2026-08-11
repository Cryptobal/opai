export type MigrationStatus =
  | "pending"
  | "running"
  | "verifying"
  | "completed"
  | "failed";

export type MigrationStats = {
  personaMigrated: number;
  operacionalMigrated: number;
  skipped: number;
  typesCreated: string[];
  needsAttention: number;
  batches: number;
};

export type ParityMismatch = {
  kind: string;
  detail: string;
  sampleIds?: string[];
};

export type ParityReport = {
  ok: boolean;
  mismatches: ParityMismatch[];
  counts?: Record<string, number>;
};

export const LEGACY_PERSONA = "ops_documento_persona";
export const LEGACY_OPERACIONAL = "doc_operacional";

export const BATCH_SIZE = 200;

export function emptyStats(): MigrationStats {
  return {
    personaMigrated: 0,
    operacionalMigrated: 0,
    skipped: 0,
    typesCreated: [],
    needsAttention: 0,
    batches: 0,
  };
}
