-- ──────────────────────────────────────────────────────────────────────
-- Hilo de Slack por ticket (Fase 7). 100% aditiva.
--
-- La tarjeta de creación del ticket en el canal ruteado es la raíz del hilo;
-- los eventos siguientes (aprobación, cambios de estado/prioridad, SLA,
-- comentarios) se publican como reply del mismo `slack_ts`. `ticket_id` único.
-- ──────────────────────────────────────────────────────────────────────

CREATE TABLE IF NOT EXISTS "public"."ticket_slack_threads" (
  "id"               TEXT NOT NULL,
  "tenant_id"        TEXT NOT NULL,
  "ticket_id"        TEXT NOT NULL,
  "slack_channel_id" TEXT NOT NULL,
  "slack_ts"         TEXT NOT NULL,
  "created_at"       TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT "ticket_slack_threads_pkey" PRIMARY KEY ("id")
);

CREATE UNIQUE INDEX IF NOT EXISTS "ticket_slack_threads_ticket_id_key"
  ON "public"."ticket_slack_threads" ("ticket_id");
CREATE INDEX IF NOT EXISTS "idx_ticket_slack_thread_tenant"
  ON "public"."ticket_slack_threads" ("tenant_id");
