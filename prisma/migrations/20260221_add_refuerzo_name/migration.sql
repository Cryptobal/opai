-- Add "name" column to refuerzo_solicitudes
ALTER TABLE "ops"."refuerzo_solicitudes" ADD COLUMN IF NOT EXISTS "name" TEXT;
