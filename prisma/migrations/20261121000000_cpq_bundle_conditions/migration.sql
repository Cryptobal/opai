-- CPQ v2: condiciones comerciales + gasto financiero a nivel propuesta (bundle).
-- Aditivo y nullable: null = campo aún no gobernado por el bundle (compatible v1).
ALTER TABLE "cpq"."proposal_bundles"
  ADD COLUMN IF NOT EXISTS "payment_terms" TEXT,
  ADD COLUMN IF NOT EXISTS "service_start_days" INTEGER,
  ADD COLUMN IF NOT EXISTS "contract_duration" INTEGER,
  ADD COLUMN IF NOT EXISTS "is_ongoing_service" BOOLEAN,
  ADD COLUMN IF NOT EXISTS "adjustment_type" TEXT,
  ADD COLUMN IF NOT EXISTS "adjustment_freq" TEXT,
  ADD COLUMN IF NOT EXISTS "ipc_weight" INTEGER,
  ADD COLUMN IF NOT EXISTS "imo_weight" INTEGER,
  ADD COLUMN IF NOT EXISTS "insurance_policy_uf" DECIMAL(10,2),
  ADD COLUMN IF NOT EXISTS "liability_months" INTEGER,
  ADD COLUMN IF NOT EXISTS "real_annual_increment" INTEGER,
  ADD COLUMN IF NOT EXISTS "payment_days" INTEGER,
  ADD COLUMN IF NOT EXISTS "payment_day_mode" TEXT,
  ADD COLUMN IF NOT EXISTS "financial_enabled" BOOLEAN,
  ADD COLUMN IF NOT EXISTS "financial_rate_pct" DECIMAL(6,4);
