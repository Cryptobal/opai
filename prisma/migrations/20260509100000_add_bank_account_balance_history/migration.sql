-- CreateEnum
CREATE TYPE "finance"."FinanceBalanceSource" AS ENUM ('MANUAL', 'IMPORT', 'CALCULATED');

-- CreateTable
CREATE TABLE "finance"."finance_bank_account_balances" (
    "id" UUID NOT NULL DEFAULT uuid_generate_v4(),
    "tenant_id" TEXT NOT NULL,
    "bank_account_id" UUID NOT NULL,
    "as_of_date" DATE NOT NULL,
    "balance" DECIMAL(14,2) NOT NULL,
    "source" "finance"."FinanceBalanceSource" NOT NULL DEFAULT 'MANUAL',
    "note" TEXT,
    "created_by" UUID,
    "created_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "finance_bank_account_balances_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "idx_finance_bank_balance_date" ON "finance"."finance_bank_account_balances"("tenant_id", "bank_account_id", "as_of_date");

-- AddForeignKey
ALTER TABLE "finance"."finance_bank_account_balances" ADD CONSTRAINT "finance_bank_account_balances_bank_account_id_fkey" FOREIGN KEY ("bank_account_id") REFERENCES "finance"."finance_bank_accounts"("id") ON DELETE CASCADE ON UPDATE CASCADE;
