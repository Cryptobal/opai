-- AlterTable
ALTER TABLE "crm"."email_threads" ADD COLUMN IF NOT EXISTS "ai_plan_draft" JSONB;
