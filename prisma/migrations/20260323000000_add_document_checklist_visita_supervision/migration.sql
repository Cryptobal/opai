-- AlterTable
ALTER TABLE "ops"."visitas_supervision" ADD COLUMN IF NOT EXISTS "document_checklist" JSONB;
