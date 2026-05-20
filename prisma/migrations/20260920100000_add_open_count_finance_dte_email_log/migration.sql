-- ────────────────────────────────────────────────────────────────────────────
-- Agrega open_count a finance_dte_email_logs para llevar conteo de aperturas.
--
-- Cada vez que Resend manda `email.opened` para un resendId que matchea
-- un FinanceDteEmailLog, el webhook incrementa este contador y, la
-- primera vez, setea openedAt. Distingue "lo abrió 1 vez" de "lo
-- abrió 5 veces" — útil para seguimiento de cobranza.
-- ────────────────────────────────────────────────────────────────────────────

ALTER TABLE "finance"."finance_dte_email_logs"
  ADD COLUMN IF NOT EXISTS "open_count" INTEGER NOT NULL DEFAULT 0;
