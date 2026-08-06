-- Migration: finance_dte_email_kind_add_cobranza_variants
-- Agrega MANUAL_COBRANZA y AUTO_COBRANZA al enum FinanceDteEmailKind para
-- distinguir los recordatorios de cobranza (manuales desde la planilla vs.
-- automáticos del cron) del resto de los envíos DTE en el email log.
--
-- Va en su propia migración: ALTER TYPE ADD VALUE no puede compartir
-- transacción con sentencias que USEN el valor nuevo.

ALTER TYPE "finance"."FinanceDteEmailKind" ADD VALUE IF NOT EXISTS 'MANUAL_COBRANZA';
ALTER TYPE "finance"."FinanceDteEmailKind" ADD VALUE IF NOT EXISTS 'AUTO_COBRANZA';
