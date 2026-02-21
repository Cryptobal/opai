-- AlterTable
ALTER TABLE "cpq"."quotes" ADD COLUMN IF NOT EXISTS "created_from_lead_id" UUID;
