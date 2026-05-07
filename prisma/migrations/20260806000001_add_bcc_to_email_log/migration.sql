-- Agrega columna bcc a finance_dte_email_logs.
-- Usado por el modal SendEmailDialog para reenvíos manuales con
-- destinatarios ocultos. El auto-envío (al emitir) sigue sin BCC.
ALTER TABLE "finance"."finance_dte_email_logs"
  ADD COLUMN IF NOT EXISTS "bcc" TEXT[] NOT NULL DEFAULT '{}'::TEXT[];
