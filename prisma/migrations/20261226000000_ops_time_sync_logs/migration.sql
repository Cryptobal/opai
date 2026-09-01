-- Res. Ex. N°38 Art. 11: bitácora de verificación horaria (aditivo).

CREATE TABLE IF NOT EXISTS "ops"."time_sync_logs" (
  "id" TEXT NOT NULL,
  "checked_at" TIMESTAMPTZ(6) NOT NULL,
  "reference_source" TEXT NOT NULL,
  "reference_time" TIMESTAMPTZ(6),
  "server_time" TIMESTAMPTZ(6) NOT NULL,
  "rtt_ms" INTEGER,
  "drift_ms" INTEGER,
  "status" TEXT NOT NULL,
  "created_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT "time_sync_logs_pkey" PRIMARY KEY ("id")
);

CREATE INDEX IF NOT EXISTS "idx_ops_time_sync_log_checked"
  ON "ops"."time_sync_logs"("checked_at");
