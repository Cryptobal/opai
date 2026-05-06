-- Tracking de consultas de estado SII para el cron horario.
-- Permite no consultar el mismo DTE más de una vez por hora y poner
-- timeout después de N reintentos.
ALTER TABLE "finance"."finance_dtes"
  ADD COLUMN "sii_last_status_check_at" TIMESTAMPTZ(6),
  ADD COLUMN "sii_status_check_count" INTEGER NOT NULL DEFAULT 0;

-- Índice para query del cron (DTEs pendientes de actualización).
CREATE INDEX "idx_finance_dte_sii_pending" ON "finance"."finance_dtes"("tenant_id", "sii_status", "sii_last_status_check_at")
  WHERE "sii_status" IN ('PENDING', 'SENT') AND "sii_track_id" IS NOT NULL;
