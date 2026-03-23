-- Fecha de vencimiento del curso OS-10
ALTER TABLE "ops"."guardias"
  ADD COLUMN IF NOT EXISTS "os10_expires_at" DATE;
