-- AlterTable
ALTER TABLE "ops"."guard_events" ADD COLUMN IF NOT EXISTS "afc_deduction_amount" DECIMAL(12,0);
