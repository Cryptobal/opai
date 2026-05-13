-- ──────────────────────────────────────────────────────────────────────────
--  DTE Emitidos · Fase 1.A — Flags por tipo de documento en crm.contacts.
--
--  Pre-marcado de contactos al enviar/reenviar un DTE según `dteType`.
--  Reemplaza la lógica histórica que sólo usaba `is_primary` + arrays
--  opacos `proforma_recipient_contact_ids` / `estado_pago_recipient_contact_ids`.
-- ──────────────────────────────────────────────────────────────────────────

ALTER TABLE "crm"."contacts"
  ADD COLUMN "recibe_facturacion"   BOOLEAN NOT NULL DEFAULT false,
  ADD COLUMN "recibe_notas_credito" BOOLEAN NOT NULL DEFAULT false,
  ADD COLUMN "recibe_cobranza"      BOOLEAN NOT NULL DEFAULT false,
  ADD COLUMN "recibe_operacional"   BOOLEAN NOT NULL DEFAULT false;

-- Backfill 1: contactos primarios reciben Facturación + NC por default.
UPDATE "crm"."contacts"
SET "recibe_facturacion" = true,
    "recibe_notas_credito" = true
WHERE "is_primary" = true;

-- Backfill 2: contactos referenciados desde Proforma/Estado de Pago
-- en DTEs existentes reciben Cobranza.
UPDATE "crm"."contacts" c
SET "recibe_cobranza" = true
WHERE c."id"::text = ANY (
  SELECT DISTINCT unnest("proforma_recipient_contact_ids"::text[])
  FROM "finance"."finance_dtes"
  WHERE "proforma_recipient_contact_ids" IS NOT NULL
    AND array_length("proforma_recipient_contact_ids", 1) > 0
)
OR c."id"::text = ANY (
  SELECT DISTINCT unnest("estado_pago_recipient_contact_ids"::text[])
  FROM "finance"."finance_dtes"
  WHERE "estado_pago_recipient_contact_ids" IS NOT NULL
    AND array_length("estado_pago_recipient_contact_ids", 1) > 0
);

-- Backfill 3: contactos preferidos para documento de cobro
-- (CrmAccount.contacto_estado_pago_id) reciben Cobranza.
UPDATE "crm"."contacts" c
SET "recibe_cobranza" = true
FROM "crm"."accounts" a
WHERE a."contacto_estado_pago_id" = c."id";
