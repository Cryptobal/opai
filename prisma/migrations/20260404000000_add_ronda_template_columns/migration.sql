-- Add missing columns to OpsRondaTemplate for Portal de Rondas
-- These columns were defined in the Prisma schema but never migrated to production.

ALTER TABLE "ops"."ronda_templates"
  ADD COLUMN IF NOT EXISTS "order_mode" TEXT NOT NULL DEFAULT 'flexible';

ALTER TABLE "ops"."ronda_templates"
  ADD COLUMN IF NOT EXISTS "estimated_duration_min" INTEGER;

ALTER TABLE "ops"."ronda_templates"
  ADD COLUMN IF NOT EXISTS "qr_requerido" BOOLEAN NOT NULL DEFAULT false;
