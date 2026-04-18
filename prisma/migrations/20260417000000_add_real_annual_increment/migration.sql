-- Add real_annual_increment to CpqQuote (default 3%)
ALTER TABLE "cpq"."quotes"
ADD COLUMN "real_annual_increment" integer NOT NULL DEFAULT 3;

-- Backfill adjustment_type based on currency for ALL existing quotes:
--   currency = 'UF'  → 'NONE' (UF already carries implicit IPC)
--   currency = 'CLP' → 'IPC'
UPDATE "cpq"."quotes"
SET "adjustment_type" = 'NONE'
WHERE "currency" = 'UF';

UPDATE "cpq"."quotes"
SET "adjustment_type" = 'IPC'
WHERE "currency" = 'CLP';
