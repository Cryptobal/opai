-- Lista de emails para alertas operativas del módulo facturación
-- (DTE rechazado por SII, certificado por vencer, etc).
ALTER TABLE "public"."tenant_dte_configs"
  ADD COLUMN "alert_emails" TEXT[] NOT NULL DEFAULT ARRAY[]::TEXT[];
