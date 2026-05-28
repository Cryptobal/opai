-- ──────────────────────────────────────────────────────────────────────
-- Fase B.1 — Exclusión automática de bank tx del cómputo de cuadratura +
-- umbral configurable de comisión.
--
--   * finance_bank_transactions: excluded_reason / excluded_at / excluded_by
--     ("interna" | "comision" | "manual_override"; NULL = no excluida).
--   * finance_cashflow_config: bank_commission_threshold_clp (default 10.000).
--   * Índice (tenant_id, excluded_reason) para filtrar excluidas rápido.
--
-- Todas las columnas son opcionales o tienen default → seguro aplicar sobre
-- datos existentes. El backfill de excluded_reason para tx históricas va
-- aparte (prisma/scripts/backfill-bank-exclusions.ts), nunca auto-ejecutado.
-- ──────────────────────────────────────────────────────────────────────

-- AlterTable
ALTER TABLE "finance"."finance_bank_transactions"
  ADD COLUMN IF NOT EXISTS "excluded_reason" VARCHAR(20),
  ADD COLUMN IF NOT EXISTS "excluded_at" TIMESTAMPTZ(6),
  ADD COLUMN IF NOT EXISTS "excluded_by" TEXT;

-- AlterTable
ALTER TABLE "finance"."finance_cashflow_config"
  ADD COLUMN IF NOT EXISTS "bank_commission_threshold_clp" INTEGER NOT NULL DEFAULT 10000;

-- CreateIndex
CREATE INDEX IF NOT EXISTS "idx_finance_bank_tx_excluded"
  ON "finance"."finance_bank_transactions"("tenant_id", "excluded_reason");
