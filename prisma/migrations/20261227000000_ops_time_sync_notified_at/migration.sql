-- Entrega del correo de alerta Art. 11 (aditivo). Null = reintentar.

ALTER TABLE "ops"."time_sync_logs"
  ADD COLUMN IF NOT EXISTS "notified_at" TIMESTAMPTZ(6);
