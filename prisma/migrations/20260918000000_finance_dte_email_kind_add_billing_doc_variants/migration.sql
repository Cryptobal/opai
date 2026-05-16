-- Migration: finance_dte_email_kind_add_billing_doc_variants
-- Agrega AUTO_PROFORMA, AUTO_ESTADO_PAGO, MANUAL_PROFORMA, MANUAL_ESTADO_PAGO
-- al enum FinanceDteEmailKind para trazabilidad granular de envíos del cron.

ALTER TYPE "finance"."FinanceDteEmailKind" ADD VALUE IF NOT EXISTS 'AUTO_PROFORMA';
ALTER TYPE "finance"."FinanceDteEmailKind" ADD VALUE IF NOT EXISTS 'AUTO_ESTADO_PAGO';
ALTER TYPE "finance"."FinanceDteEmailKind" ADD VALUE IF NOT EXISTS 'MANUAL_PROFORMA';
ALTER TYPE "finance"."FinanceDteEmailKind" ADD VALUE IF NOT EXISTS 'MANUAL_ESTADO_PAGO';
