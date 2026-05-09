-- CreateEnum
CREATE TYPE "finance"."FinanceLinkTarget" AS ENUM ('DTE_ISSUED', 'DTE_RECEIVED', 'PAYROLL_LIQUIDACION', 'PAYROLL_ANTICIPO', 'TE_LOTE', 'EXPENSE', 'INCOME');

-- CreateTable
CREATE TABLE "finance"."finance_bank_transaction_links" (
    "id" UUID NOT NULL DEFAULT uuid_generate_v4(),
    "tenant_id" TEXT NOT NULL,
    "bank_transaction_id" UUID NOT NULL,
    "target_type" "finance"."FinanceLinkTarget" NOT NULL,
    "target_id" UUID,
    "amount" DECIMAL(14,2) NOT NULL,
    "account_plan_id" UUID,
    "note" TEXT,
    "created_by" UUID,
    "created_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "finance_bank_transaction_links_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "idx_finance_bank_link_tx" ON "finance"."finance_bank_transaction_links"("tenant_id", "bank_transaction_id");

-- CreateIndex
CREATE INDEX "idx_finance_bank_link_target" ON "finance"."finance_bank_transaction_links"("target_type", "target_id");

-- AddForeignKey
ALTER TABLE "finance"."finance_bank_transaction_links" ADD CONSTRAINT "finance_bank_transaction_links_bank_transaction_id_fkey" FOREIGN KEY ("bank_transaction_id") REFERENCES "finance"."finance_bank_transactions"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "finance"."finance_bank_transaction_links" ADD CONSTRAINT "finance_bank_transaction_links_account_plan_id_fkey" FOREIGN KEY ("account_plan_id") REFERENCES "finance"."finance_account_plan"("id") ON DELETE SET NULL ON UPDATE CASCADE;
