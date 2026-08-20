-- Privacidad de sueldos por cargo (Director, Reclutador, etc.).
ALTER TABLE "cpq"."cargos"
  ADD COLUMN IF NOT EXISTS "salary_sensitive" BOOLEAN NOT NULL DEFAULT false;
