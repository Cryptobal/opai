-- Ley 21.719 — Contacto del DPO (Data Protection Officer) por tenant
-- Reemplaza el hardcode datos@opai.cl en el portal guardia.
-- Idempotent: ADD COLUMN IF NOT EXISTS.
ALTER TABLE "public"."Tenant"
  ADD COLUMN IF NOT EXISTS "dpo_contact_email" TEXT;
