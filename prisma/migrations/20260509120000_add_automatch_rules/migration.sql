-- CreateEnum
CREATE TYPE "finance"."FinanceAutoMatchScope" AS ENUM ('DEPOSITS', 'WITHDRAWALS', 'BOTH');

-- CreateTable
CREATE TABLE "finance"."finance_automatch_rules" (
    "id" UUID NOT NULL DEFAULT uuid_generate_v4(),
    "tenant_id" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "enabled" BOOLEAN NOT NULL DEFAULT true,
    "priority" INTEGER NOT NULL DEFAULT 100,
    "applies_to" "finance"."FinanceAutoMatchScope" NOT NULL DEFAULT 'BOTH',
    "conditions" JSONB NOT NULL,
    "action" JSONB NOT NULL,
    "times_matched" INTEGER NOT NULL DEFAULT 0,
    "last_matched_at" TIMESTAMPTZ(6),
    "created_by" UUID,
    "created_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMPTZ(6) NOT NULL,

    CONSTRAINT "finance_automatch_rules_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "idx_finance_automatch_lookup" ON "finance"."finance_automatch_rules"("tenant_id", "enabled", "priority");
