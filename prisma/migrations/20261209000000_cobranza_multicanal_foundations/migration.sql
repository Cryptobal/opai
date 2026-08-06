-- Cobranza multicanal — capa de datos (Brief B).
-- Aditiva: sin DROP, sin NOT NULL sobre columnas existentes, sin backfill.
--
-- 1. crm.accounts.contacto_cobranza_id → contacto que recibe la cobranza de
--    este cliente. Independiente de `contacto_estado_pago_id` (documento de
--    cobro pre-emisión): quien firma el estado de pago no siempre es quien
--    paga. NULL = cascada por `recibe_cobranza` → contacto principal.
-- 2. finance.finance_dtes.cobranza_* → tracking de envíos de cobranza,
--    mismo patrón que proforma_sent_at / proforma_sent_count.
-- 3. finance.finance_cashflow_config.cobranza_whatsapp_auto_enabled → flag
--    per-tenant para envío automático por Twilio (default false).

ALTER TABLE "crm"."accounts"
  ADD COLUMN IF NOT EXISTS "contacto_cobranza_id" UUID;

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint WHERE conname = 'accounts_contacto_cobranza_id_fkey'
  ) THEN
    ALTER TABLE "crm"."accounts"
      ADD CONSTRAINT "accounts_contacto_cobranza_id_fkey"
      FOREIGN KEY ("contacto_cobranza_id") REFERENCES "crm"."contacts"("id")
      ON DELETE SET NULL ON UPDATE CASCADE;
  END IF;
END $$;

CREATE INDEX IF NOT EXISTS "idx_crm_accounts_contacto_cobranza"
  ON "crm"."accounts" ("tenant_id", "contacto_cobranza_id");

ALTER TABLE "finance"."finance_dtes"
  ADD COLUMN IF NOT EXISTS "cobranza_sent_at" TIMESTAMPTZ(6),
  ADD COLUMN IF NOT EXISTS "cobranza_sent_count" INTEGER NOT NULL DEFAULT 0,
  ADD COLUMN IF NOT EXISTS "cobranza_last_level" TEXT;

ALTER TABLE "finance"."finance_cashflow_config"
  ADD COLUMN IF NOT EXISTS "cobranza_whatsapp_auto_enabled" BOOLEAN NOT NULL DEFAULT false;
