-- ──────────────────────────────────────────────────────────────────────────
--  Plan de Documento de Cobro en el borrador del DTE.
--
--  Cuando el usuario crea/edita un draft, decide ANTES de emitir al SII si
--  ese DTE requiere mandar Proforma y/o Estado de Pago al cliente, y a
--  qué contactos del cliente. El plan queda persistido en el draft, así
--  cuando el usuario ve la lista de borradores ve qué tiene pendiente.
--
--  Por cada variante hay 4 piezas:
--   1. require_xxx             → ¿este draft requiere mandar xxx?
--   2. xxx_recipient_contact_ids → IDs de CrmContact que reciben (y, en el
--                                  caso de Estado de Pago, también firman).
--   3. xxx_status (enum)       → tracking del envío (NONE | SENT | ...).
--   4. xxx_sent_at/count/last_recipient → metadata del último envío.
--
--  La columna `proforma_status` (creada en 20260810000000) ahora aplica
--  específicamente a la variante PROFORMA. `proforma_last_variant` queda
--  como columna legacy informativa pero ya no se necesita.
-- ──────────────────────────────────────────────────────────────────────────

ALTER TABLE "finance"."finance_dtes"
  ADD COLUMN "require_proforma"                  BOOLEAN NOT NULL DEFAULT false,
  ADD COLUMN "proforma_recipient_contact_ids"    UUID[] NOT NULL DEFAULT '{}',
  ADD COLUMN "require_estado_pago"               BOOLEAN NOT NULL DEFAULT false,
  ADD COLUMN "estado_pago_status"                "finance"."FinanceProformaStatus" NOT NULL DEFAULT 'NONE',
  ADD COLUMN "estado_pago_sent_at"               TIMESTAMP(6) WITH TIME ZONE,
  ADD COLUMN "estado_pago_sent_count"            INTEGER NOT NULL DEFAULT 0,
  ADD COLUMN "estado_pago_last_recipient"        TEXT,
  ADD COLUMN "estado_pago_recipient_contact_ids" UUID[] NOT NULL DEFAULT '{}';

CREATE INDEX "idx_finance_dte_estado_pago_status"
  ON "finance"."finance_dtes" ("tenant_id", "estado_pago_status");

-- Índice parcial: solo drafts con plan activo, para listar "qué borradores
-- tienen Proforma o Estado de Pago pendiente de enviar".
CREATE INDEX "idx_finance_dte_billing_plan_pending"
  ON "finance"."finance_dtes" ("tenant_id", "sii_status")
  WHERE ("require_proforma" = true AND "proforma_status" = 'NONE')
     OR ("require_estado_pago" = true AND "estado_pago_status" = 'NONE');
