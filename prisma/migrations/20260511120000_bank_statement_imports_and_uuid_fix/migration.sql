-- ─── 1. Fix: created_by debe ser TEXT, no UUID ───
-- Admin.id es CUID (formato "cm..."), no UUID. Las 3 columnas `created_by`
-- en el módulo finance estaban tipadas UUID lo que rompía cualquier insert
-- con userId real. Convertimos a TEXT con USING para no perder data (las
-- columnas están vacías en la práctica porque el bug impedía escribirlas).
ALTER TABLE "finance"."finance_bank_account_balances"
  ALTER COLUMN "created_by" TYPE TEXT USING "created_by"::text;

ALTER TABLE "finance"."finance_automatch_rules"
  ALTER COLUMN "created_by" TYPE TEXT USING "created_by"::text;

ALTER TABLE "finance"."finance_bank_transaction_links"
  ALTER COLUMN "created_by" TYPE TEXT USING "created_by"::text;

-- ─── 2. Nueva tabla: historial de cartolas importadas ───
CREATE TABLE IF NOT EXISTS "finance"."finance_bank_statement_imports" (
  "id"                      UUID            NOT NULL DEFAULT uuid_generate_v4(),
  "tenant_id"               TEXT            NOT NULL,
  "bank_account_id"         UUID            NOT NULL,
  "file_name"               TEXT            NOT NULL,
  "file_size"               INTEGER         NOT NULL,
  "bank_format"             TEXT            NOT NULL,
  "account_number_in_file"  TEXT,
  "period_from"             DATE,
  "period_to"               DATE,
  "total_in_file"           INTEGER         NOT NULL,
  "imported_count"          INTEGER         NOT NULL,
  "duplicate_count"         INTEGER         NOT NULL,
  "closing_balance"         DECIMAL(14, 2),
  "created_by"              TEXT,
  "created_at"              TIMESTAMPTZ(6)  NOT NULL DEFAULT now(),
  CONSTRAINT "finance_bank_statement_imports_pkey" PRIMARY KEY ("id"),
  CONSTRAINT "finance_bank_statement_imports_bank_account_id_fkey"
    FOREIGN KEY ("bank_account_id")
    REFERENCES "finance"."finance_bank_accounts"("id")
    ON DELETE CASCADE
    ON UPDATE CASCADE
);

CREATE INDEX IF NOT EXISTS "idx_finance_bank_stmt_import_recent"
  ON "finance"."finance_bank_statement_imports"("tenant_id", "bank_account_id", "created_at" DESC);

-- ─── 3. Enlazar transacciones a la cartola que las trajo ───
ALTER TABLE "finance"."finance_bank_transactions"
  ADD COLUMN IF NOT EXISTS "import_id" UUID;

ALTER TABLE "finance"."finance_bank_transactions"
  ADD CONSTRAINT "finance_bank_transactions_import_id_fkey"
  FOREIGN KEY ("import_id")
  REFERENCES "finance"."finance_bank_statement_imports"("id")
  ON DELETE SET NULL
  ON UPDATE CASCADE;

CREATE INDEX IF NOT EXISTS "idx_finance_bank_tx_import"
  ON "finance"."finance_bank_transactions"("import_id");
