-- Ley 21.719 — Contrato de Encargado de Tratamiento (DPA)
-- Idempotent: db push ya aplicó las columnas en algunos entornos.
ALTER TABLE "public"."Tenant"
  ADD COLUMN IF NOT EXISTS "dpa_accepted_at" TIMESTAMP(3),
  ADD COLUMN IF NOT EXISTS "dpa_accepted_by" TEXT,
  ADD COLUMN IF NOT EXISTS "dpa_version" TEXT;
