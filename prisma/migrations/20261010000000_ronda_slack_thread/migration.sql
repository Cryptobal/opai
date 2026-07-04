-- ──────────────────────────────────────────────────────────────────────
-- Hilo de Slack por ronda (Fase 19). 100% aditiva.
--
-- La tarjeta de `ronda_started` en el canal ruteado es la raíz del hilo;
-- el término (`ronda_completed`, también en variante de falla) y las alertas
-- de esa ejecución se publican como reply del mismo `slack_ts`, y el término
-- actualiza además la raíz (chat.update). `ronda_ejecucion_id` único.
-- ──────────────────────────────────────────────────────────────────────

CREATE TABLE IF NOT EXISTS "public"."ronda_slack_threads" (
  "id"                 TEXT NOT NULL,
  "tenant_id"          TEXT NOT NULL,
  "ronda_ejecucion_id" TEXT NOT NULL,
  "slack_channel_id"   TEXT NOT NULL,
  "slack_ts"           TEXT NOT NULL,
  "created_at"         TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT "ronda_slack_threads_pkey" PRIMARY KEY ("id")
);

CREATE UNIQUE INDEX IF NOT EXISTS "ronda_slack_threads_ronda_ejecucion_id_key"
  ON "public"."ronda_slack_threads" ("ronda_ejecucion_id");
CREATE INDEX IF NOT EXISTS "idx_ronda_slack_thread_tenant"
  ON "public"."ronda_slack_threads" ("tenant_id");
