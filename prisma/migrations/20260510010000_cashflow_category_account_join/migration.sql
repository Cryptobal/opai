CREATE TABLE IF NOT EXISTS "finance"."finance_cashflow_category_accounts" (
  "id"               UUID NOT NULL DEFAULT uuid_generate_v4(),
  "tenant_id"        TEXT NOT NULL,
  "category_id"      UUID NOT NULL,
  "account_plan_id"  UUID NOT NULL,
  "is_primary"       BOOLEAN NOT NULL DEFAULT false,
  "created_at"       TIMESTAMPTZ(6) NOT NULL DEFAULT now(),
  CONSTRAINT "finance_cashflow_category_accounts_pkey" PRIMARY KEY ("id")
);

CREATE UNIQUE INDEX IF NOT EXISTS "uq_cashflow_cat_account"
  ON "finance"."finance_cashflow_category_accounts"("category_id", "account_plan_id");

CREATE INDEX IF NOT EXISTS "idx_cashflow_cat_account_tenant_account"
  ON "finance"."finance_cashflow_category_accounts"("tenant_id", "account_plan_id");

CREATE UNIQUE INDEX IF NOT EXISTS "uq_cashflow_cat_account_primary"
  ON "finance"."finance_cashflow_category_accounts"("category_id")
  WHERE "is_primary" = TRUE;

DO $$ BEGIN
  ALTER TABLE "finance"."finance_cashflow_category_accounts"
    ADD CONSTRAINT "finance_cashflow_cat_account_category_fk"
    FOREIGN KEY ("category_id") REFERENCES "finance"."finance_cashflow_categories"("id")
    ON DELETE CASCADE ON UPDATE CASCADE;
EXCEPTION WHEN duplicate_object THEN NULL; END $$;

DO $$ BEGIN
  ALTER TABLE "finance"."finance_cashflow_category_accounts"
    ADD CONSTRAINT "finance_cashflow_cat_account_account_fk"
    FOREIGN KEY ("account_plan_id") REFERENCES "finance"."finance_account_plan"("id")
    ON DELETE CASCADE ON UPDATE CASCADE;
EXCEPTION WHEN duplicate_object THEN NULL; END $$;
