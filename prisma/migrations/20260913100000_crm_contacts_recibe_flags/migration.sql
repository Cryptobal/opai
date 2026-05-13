-- Agrega 4 flags booleanos a crm.contacts para que el SenderSheet del
-- módulo Finanzas/DTE pueda pre-marcar destinatarios según el tipo de
-- documento. Driven por el brief de tracking-async + mobile-first.
--
-- Data migration sigue estos criterios:
--   1. isPrimary=true → recibe Facturación + NC.
--   2. Contactos referenciados en FinanceDte.proforma_recipient_contact_ids
--      o estado_pago_recipient_contact_ids → recibe Cobranza.
--   3. CrmAccount.contacto_estado_pago_id → recibe Cobranza.
--
-- recibeOperacional queda en default false: se llena vía UI del CRM cuando
-- llegue el módulo de alertas Ops (fuera del scope de este PR).

ALTER TABLE "crm"."contacts"
  ADD COLUMN "recibe_facturacion" BOOLEAN NOT NULL DEFAULT false,
  ADD COLUMN "recibe_notas_credito" BOOLEAN NOT NULL DEFAULT false,
  ADD COLUMN "recibe_cobranza" BOOLEAN NOT NULL DEFAULT false,
  ADD COLUMN "recibe_operacional" BOOLEAN NOT NULL DEFAULT false;

-- ── Data migration ──────────────────────────────────────────────

-- 1) Contactos primarios → Facturación + NC por default.
UPDATE "crm"."contacts"
SET "recibe_facturacion" = true,
    "recibe_notas_credito" = true
WHERE "is_primary" = true;

-- 2) Contactos referenciados desde proforma/estado_pago en DTEs como receptores de Cobranza.
--    Los IDs viven en columnas UUID[]; el unnest devuelve UUIDs directamente.
UPDATE "crm"."contacts" c
SET "recibe_cobranza" = true
WHERE c."id" IN (
  SELECT DISTINCT unnest("proforma_recipient_contact_ids")
  FROM "finance"."finance_dtes"
  WHERE "proforma_recipient_contact_ids" IS NOT NULL
    AND array_length("proforma_recipient_contact_ids", 1) > 0
  UNION
  SELECT DISTINCT unnest("estado_pago_recipient_contact_ids")
  FROM "finance"."finance_dtes"
  WHERE "estado_pago_recipient_contact_ids" IS NOT NULL
    AND array_length("estado_pago_recipient_contact_ids", 1) > 0
);

-- 3) Contactos apuntados desde CrmAccount.contacto_estado_pago_id → Cobranza.
UPDATE "crm"."contacts" c
SET "recibe_cobranza" = true
FROM "crm"."accounts" a
WHERE a."contacto_estado_pago_id" = c."id";
