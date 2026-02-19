-- Add nacionalidad to ops.personas
ALTER TABLE "ops"."personas"
  ADD COLUMN IF NOT EXISTS "nacionalidad" TEXT;
