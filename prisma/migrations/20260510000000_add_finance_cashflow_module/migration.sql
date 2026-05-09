-- ════════════════════════════════════════════════════════════════
--  CASHFLOW — Flujo de caja proyectado (forecast)
-- ════════════════════════════════════════════════════════════════
-- Adds 4 new tables + 4 enums to schema "finance" for the cashflow
-- forecasting module. Idempotent: uses IF NOT EXISTS where possible.
-- Cero alteración de tablas existentes.

-- ── ENUMS ─────────────────────────────────────────────────────────
DO $$ BEGIN
  CREATE TYPE "finance"."FinanceCashflowItemKind" AS ENUM ('INCOME', 'EXPENSE');
EXCEPTION WHEN duplicate_object THEN NULL; END $$;

DO $$ BEGIN
  CREATE TYPE "finance"."FinanceCashflowRecurrence" AS ENUM ('ONCE', 'WEEKLY', 'BIWEEKLY', 'MONTHLY', 'QUARTERLY', 'YEARLY');
EXCEPTION WHEN duplicate_object THEN NULL; END $$;

DO $$ BEGIN
  CREATE TYPE "finance"."FinanceCashflowItemSource" AS ENUM ('MANUAL', 'CONTRACT', 'PAYROLL', 'RECURRING_DTE', 'SUPPLIER', 'IVA', 'TURNOS_EXTRA', 'OTHER');
EXCEPTION WHEN duplicate_object THEN NULL; END $$;

DO $$ BEGIN
  CREATE TYPE "finance"."FinanceCashflowOccurrenceStatus" AS ENUM ('PROJECTED', 'CONFIRMED', 'PAID', 'CANCELLED');
EXCEPTION WHEN duplicate_object THEN NULL; END $$;

-- ── finance_cashflow_config ───────────────────────────────────────
CREATE TABLE IF NOT EXISTS "finance"."finance_cashflow_config" (
  "id"                          UUID NOT NULL DEFAULT uuid_generate_v4(),
  "tenant_id"                   TEXT NOT NULL,
  "horizon_weeks_default"       INTEGER NOT NULL DEFAULT 52,
  "horizon_months_default"      INTEGER NOT NULL DEFAULT 12,
  "week_starts_on"              INTEGER NOT NULL DEFAULT 1,
  "auto_sales"                  BOOLEAN NOT NULL DEFAULT true,
  "auto_payroll"                BOOLEAN NOT NULL DEFAULT true,
  "auto_turnos_extra"           BOOLEAN NOT NULL DEFAULT true,
  "auto_iva"                    BOOLEAN NOT NULL DEFAULT true,
  "auto_recurring_dte"          BOOLEAN NOT NULL DEFAULT true,
  "payroll_pay_day"             INTEGER NOT NULL DEFAULT 5,
  "iva_pay_day"                 INTEGER NOT NULL DEFAULT 12,
  "match_amount_tolerance_clp"  INTEGER NOT NULL DEFAULT 5000,
  "match_days_tolerance"        INTEGER NOT NULL DEFAULT 3,
  "created_at"                  TIMESTAMPTZ(6) NOT NULL DEFAULT now(),
  "updated_at"                  TIMESTAMPTZ(6) NOT NULL DEFAULT now(),
  CONSTRAINT "finance_cashflow_config_pkey" PRIMARY KEY ("id")
);

CREATE UNIQUE INDEX IF NOT EXISTS "finance_cashflow_config_tenant_id_key"
  ON "finance"."finance_cashflow_config"("tenant_id");

-- ── finance_cashflow_categories ───────────────────────────────────
CREATE TABLE IF NOT EXISTS "finance"."finance_cashflow_categories" (
  "id"                UUID NOT NULL DEFAULT uuid_generate_v4(),
  "tenant_id"         TEXT NOT NULL,
  "code"              TEXT NOT NULL,
  "name"              TEXT NOT NULL,
  "kind"              "finance"."FinanceCashflowItemKind" NOT NULL,
  "sort_order"        INTEGER NOT NULL DEFAULT 100,
  "color"             TEXT,
  "account_plan_id"   UUID,
  "is_active"         BOOLEAN NOT NULL DEFAULT true,
  "is_system"         BOOLEAN NOT NULL DEFAULT false,
  "created_at"        TIMESTAMPTZ(6) NOT NULL DEFAULT now(),
  "updated_at"        TIMESTAMPTZ(6) NOT NULL DEFAULT now(),
  CONSTRAINT "finance_cashflow_categories_pkey" PRIMARY KEY ("id")
);

CREATE UNIQUE INDEX IF NOT EXISTS "uq_cashflow_category_code"
  ON "finance"."finance_cashflow_categories"("tenant_id", "code");

CREATE INDEX IF NOT EXISTS "idx_cashflow_category_tenant"
  ON "finance"."finance_cashflow_categories"("tenant_id", "is_active");

DO $$ BEGIN
  ALTER TABLE "finance"."finance_cashflow_categories"
    ADD CONSTRAINT "finance_cashflow_categories_account_plan_id_fkey"
    FOREIGN KEY ("account_plan_id") REFERENCES "finance"."finance_account_plan"("id")
    ON DELETE SET NULL ON UPDATE CASCADE;
EXCEPTION WHEN duplicate_object THEN NULL; END $$;

-- ── finance_cashflow_items ────────────────────────────────────────
CREATE TABLE IF NOT EXISTS "finance"."finance_cashflow_items" (
  "id"                UUID NOT NULL DEFAULT uuid_generate_v4(),
  "tenant_id"         TEXT NOT NULL,
  "category_id"       UUID NOT NULL,
  "kind"              "finance"."FinanceCashflowItemKind" NOT NULL,
  "source"            "finance"."FinanceCashflowItemSource" NOT NULL DEFAULT 'MANUAL',
  "source_ref_id"     UUID,
  "name"              TEXT NOT NULL,
  "description"       TEXT,
  "amount"            DECIMAL(14,2) NOT NULL,
  "currency"          TEXT NOT NULL DEFAULT 'CLP',
  "uf_fixing_policy"  TEXT,
  "uf_fixing_day"     INTEGER,
  "recurrence"        "finance"."FinanceCashflowRecurrence" NOT NULL,
  "day_of_month"      INTEGER,
  "day_of_week"       INTEGER,
  "month_of_year"     INTEGER,
  "start_date"        DATE NOT NULL,
  "end_date"          DATE,
  "installation_id"   UUID,
  "crm_account_id"    UUID,
  "supplier_id"       UUID,
  "is_active"         BOOLEAN NOT NULL DEFAULT true,
  "notes"             TEXT,
  "created_by"        UUID,
  "created_at"        TIMESTAMPTZ(6) NOT NULL DEFAULT now(),
  "updated_at"        TIMESTAMPTZ(6) NOT NULL DEFAULT now(),
  CONSTRAINT "finance_cashflow_items_pkey" PRIMARY KEY ("id")
);

CREATE INDEX IF NOT EXISTS "idx_cashflow_item_tenant_active"
  ON "finance"."finance_cashflow_items"("tenant_id", "is_active", "kind");

CREATE INDEX IF NOT EXISTS "idx_cashflow_item_category"
  ON "finance"."finance_cashflow_items"("category_id");

CREATE INDEX IF NOT EXISTS "idx_cashflow_item_source"
  ON "finance"."finance_cashflow_items"("source", "source_ref_id");

CREATE INDEX IF NOT EXISTS "idx_cashflow_item_installation"
  ON "finance"."finance_cashflow_items"("installation_id");

DO $$ BEGIN
  ALTER TABLE "finance"."finance_cashflow_items"
    ADD CONSTRAINT "finance_cashflow_items_category_id_fkey"
    FOREIGN KEY ("category_id") REFERENCES "finance"."finance_cashflow_categories"("id")
    ON DELETE RESTRICT ON UPDATE CASCADE;
EXCEPTION WHEN duplicate_object THEN NULL; END $$;

-- ── finance_cashflow_occurrences ──────────────────────────────────
CREATE TABLE IF NOT EXISTS "finance"."finance_cashflow_occurrences" (
  "id"                  UUID NOT NULL DEFAULT uuid_generate_v4(),
  "tenant_id"           TEXT NOT NULL,
  "item_id"             UUID NOT NULL,
  "scheduled_date"      DATE NOT NULL,
  "effective_date"      DATE,
  "amount_override"     DECIMAL(14,2),
  "uf_value_used"       DECIMAL(10,2),
  "amount_clp"          DECIMAL(14,2) NOT NULL,
  "status"              "finance"."FinanceCashflowOccurrenceStatus" NOT NULL DEFAULT 'PROJECTED',
  "bank_transaction_id" UUID,
  "matched_at"          TIMESTAMPTZ(6),
  "matched_by"          UUID,
  "notes"               TEXT,
  "created_at"          TIMESTAMPTZ(6) NOT NULL DEFAULT now(),
  "updated_at"          TIMESTAMPTZ(6) NOT NULL DEFAULT now(),
  CONSTRAINT "finance_cashflow_occurrences_pkey" PRIMARY KEY ("id")
);

CREATE UNIQUE INDEX IF NOT EXISTS "uq_cashflow_occ_item_date"
  ON "finance"."finance_cashflow_occurrences"("item_id", "scheduled_date");

CREATE INDEX IF NOT EXISTS "idx_cashflow_occ_tenant_date"
  ON "finance"."finance_cashflow_occurrences"("tenant_id", "scheduled_date");

CREATE INDEX IF NOT EXISTS "idx_cashflow_occ_tenant_status"
  ON "finance"."finance_cashflow_occurrences"("tenant_id", "status");

CREATE INDEX IF NOT EXISTS "idx_cashflow_occ_bank_tx"
  ON "finance"."finance_cashflow_occurrences"("bank_transaction_id");

DO $$ BEGIN
  ALTER TABLE "finance"."finance_cashflow_occurrences"
    ADD CONSTRAINT "finance_cashflow_occurrences_item_id_fkey"
    FOREIGN KEY ("item_id") REFERENCES "finance"."finance_cashflow_items"("id")
    ON DELETE CASCADE ON UPDATE CASCADE;
EXCEPTION WHEN duplicate_object THEN NULL; END $$;
