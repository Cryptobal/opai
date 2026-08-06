-- Aditiva: procedencia estructurada en vínculos bancarios.
-- Sin DROP, sin NOT NULL, sin ALTER TYPE sobre enums existentes.

CREATE TYPE "finance"."FinanceLinkMatchSource" AS ENUM (
  'RULE',
  'DTE',
  'TURNO_EXTRA',
  'PAYROLL',
  'FINIQUITO',
  'INFERRED',
  'MANUAL'
);

ALTER TABLE "finance"."finance_bank_transaction_links"
  ADD COLUMN "matched_by_rule_id" UUID,
  ADD COLUMN "match_source" "finance"."FinanceLinkMatchSource";

CREATE INDEX "idx_finance_bank_link_matched_rule"
  ON "finance"."finance_bank_transaction_links" ("tenant_id", "matched_by_rule_id");

CREATE INDEX "idx_finance_bank_link_match_source"
  ON "finance"."finance_bank_transaction_links" ("tenant_id", "match_source");

-- Backfill conservador: solo nota legible de auto-match por regla.
-- matched_by_rule_id queda NULL (resolver por nombre es ambiguo).
UPDATE "finance"."finance_bank_transaction_links"
SET "match_source" = 'RULE'
WHERE "note" LIKE 'Auto-match por regla:%'
  AND "match_source" IS NULL;
