-- ──────────────────────────────────────────────────────────────────────
-- Fase C.1 — Cierre semanal manual (escape al saldo del banco) + flag de
-- occurrence de ajuste automático.
--
--   * finance_cashflow_weekly_close: is_manual / forced_balance_clp /
--     manual_reason / adjust_occurrence_id.
--   * finance_cashflow_occurrences: is_closing_adjust + índice.
--
-- Todas las columnas tienen default o son opcionales → seguro sobre datos
-- existentes (cierres previos quedan is_manual=false).
-- ──────────────────────────────────────────────────────────────────────

-- AlterTable
ALTER TABLE "finance"."finance_cashflow_weekly_close"
  ADD COLUMN IF NOT EXISTS "is_manual" BOOLEAN NOT NULL DEFAULT false,
  ADD COLUMN IF NOT EXISTS "forced_balance_clp" DECIMAL(14,2),
  ADD COLUMN IF NOT EXISTS "manual_reason" TEXT,
  ADD COLUMN IF NOT EXISTS "adjust_occurrence_id" UUID;

-- AlterTable
ALTER TABLE "finance"."finance_cashflow_occurrences"
  ADD COLUMN IF NOT EXISTS "is_closing_adjust" BOOLEAN NOT NULL DEFAULT false;

-- CreateIndex
CREATE INDEX IF NOT EXISTS "idx_cashflow_occ_closing_adjust"
  ON "finance"."finance_cashflow_occurrences"("tenant_id", "is_closing_adjust");
