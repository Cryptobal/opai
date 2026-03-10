-- Add missing columns to marcacion_checkpoints
ALTER TABLE "ops"."marcacion_checkpoints" ADD COLUMN IF NOT EXISTS "geo_accuracy" DOUBLE PRECISION;
ALTER TABLE "ops"."marcacion_checkpoints" ADD COLUMN IF NOT EXISTS "geo_confidence" VARCHAR(20);
