-- ────────────────────────────────────────────────────────────────────────────
-- FinanceCashflowWeeklyClose: anchor + variance resolution
-- Permite que un cierre semanal sirva de anchor de la proyección hacia
-- adelante. Constraint de unicidad parcial garantiza un solo anchor activo
-- por tenant. varianceResolution audita cómo se cerró el drift.
-- ────────────────────────────────────────────────────────────────────────────

ALTER TABLE "finance"."finance_cashflow_weekly_close"
  ADD COLUMN "is_anchor" BOOLEAN NOT NULL DEFAULT false,
  ADD COLUMN "variance_resolution" VARCHAR(20);

-- Garantiza máximo un anchor activo por tenant
CREATE UNIQUE INDEX "uq_cashflow_weekly_close_anchor_per_tenant"
  ON "finance"."finance_cashflow_weekly_close" ("tenant_id")
  WHERE "is_anchor" = true;

-- Check constraint para validar valores de varianceResolution
ALTER TABLE "finance"."finance_cashflow_weekly_close"
  ADD CONSTRAINT "ck_cashflow_weekly_close_variance_resolution"
  CHECK (variance_resolution IS NULL OR variance_resolution IN ('ADJUSTED', 'ACCEPTED', 'PENDING'));
