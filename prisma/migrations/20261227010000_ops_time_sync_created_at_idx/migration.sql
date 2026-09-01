-- Orden cronológico de bitácora por reloj de BD, no por el reloj medido.

CREATE INDEX IF NOT EXISTS "idx_ops_time_sync_log_created"
  ON "ops"."time_sync_logs"("created_at");
