-- AlterTable
ALTER TABLE "cpq"."quotes"
  ADD COLUMN IF NOT EXISTS "payment_day_mode" TEXT NOT NULL DEFAULT 'SPECIFIC_DAY';
