-- AlterTable
ALTER TABLE "finance"."finance_bank_transactions"
  ADD COLUMN "suggested_rule_id" UUID,
  ADD COLUMN "suggested_account_plan_id" UUID;

-- CreateIndex
CREATE INDEX "idx_finance_bank_tx_suggestion" ON "finance"."finance_bank_transactions"("suggested_rule_id");
