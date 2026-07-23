-- ──────────────────────────────────────────────────────────────────────
-- Destinatarios de aviso de cesión configurables por cliente (ADITIVA).
--
--   1. crm.contacts.recibe_cesion          — flag por-contacto (default false)
--   2. crm.accounts.cesion_notificar_deudor — opt-out por-cliente (default true)
--   3. idx_crm_contacts_cesion              — índice de resolución
--
-- Falla segura: recibe_cesion default false → tras el deploy ningún cliente
-- notifica al deudor hasta que se marque explícitamente al menos un contacto.
-- Elimina el fallback silencioso a FinanceDte.receiver_email.
-- ──────────────────────────────────────────────────────────────────────

ALTER TABLE "crm"."contacts"
  ADD COLUMN IF NOT EXISTS "recibe_cesion" BOOLEAN NOT NULL DEFAULT false;

ALTER TABLE "crm"."accounts"
  ADD COLUMN IF NOT EXISTS "cesion_notificar_deudor" BOOLEAN NOT NULL DEFAULT true;

CREATE INDEX IF NOT EXISTS "idx_crm_contacts_cesion"
  ON "crm"."contacts" ("tenant_id", "account_id", "recibe_cesion");
