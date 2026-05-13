-- Auto-envío de PROFORMA y ESTADO_DE_PAGO desde plantillas recurrentes.
-- Cuando el cron genera el borrador, si el flag está en true dispara
-- sendBillingDocument() con la variante correspondiente. Default false
-- para no afectar plantillas existentes.

ALTER TABLE "finance"."finance_dte_recurring_templates"
  ADD COLUMN "auto_send_proforma" BOOLEAN NOT NULL DEFAULT false;

ALTER TABLE "finance"."finance_dte_recurring_templates"
  ADD COLUMN "auto_send_payment_statement" BOOLEAN NOT NULL DEFAULT false;
