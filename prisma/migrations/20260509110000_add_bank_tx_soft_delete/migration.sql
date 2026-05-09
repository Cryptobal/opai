-- AlterTable
ALTER TABLE "finance"."finance_bank_transactions"
  ADD COLUMN "hidden_at" TIMESTAMPTZ(6),
  ADD COLUMN "hidden_by" UUID,
  ADD COLUMN "hidden_reason" TEXT;

-- CreateIndex
CREATE INDEX "idx_finance_bank_tx_hidden" ON "finance"."finance_bank_transactions"("hidden_at");
