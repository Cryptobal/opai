-- AlterTable
ALTER TABLE "cpq"."quotes" ADD COLUMN IF NOT EXISTS "proposal_ai_content" JSONB,
ADD COLUMN IF NOT EXISTS "proposal_ai_generated_at" TIMESTAMPTZ(6);
