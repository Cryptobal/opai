-- ──────────────────────────────────────────────────────────────────────
-- Integración Slack (Fase 2) — bot conversacional + interactividad.
--
--   * slack_bot_threads     : memoria conversacional del bot por thread.
--   * slack_pending_actions : confirmaciones preview/confirm + aprobaciones
--                             de tickets pendientes (expiran a los 15 min).
--
-- Frontera de aislamiento: slack_team_id → slack_workspaces.tenant_id.
-- 100% aditiva: CREATE TABLE/INDEX IF NOT EXISTS. Sin DROP ni ALTER destructivo.
-- ──────────────────────────────────────────────────────────────────────

-- Memoria conversacional por thread
CREATE TABLE IF NOT EXISTS "public"."slack_bot_threads" (
  "id"              TEXT NOT NULL,
  "tenant_id"       TEXT NOT NULL,
  "workspace_id"    TEXT NOT NULL,
  "channel_id"      TEXT NOT NULL,
  "thread_ts"       TEXT NOT NULL,
  "transcript"      JSONB NOT NULL DEFAULT '[]',
  "last_message_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "created_at"      TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT "slack_bot_threads_pkey" PRIMARY KEY ("id")
);

CREATE UNIQUE INDEX IF NOT EXISTS "uq_slack_bot_thread_ws_channel_ts"
  ON "public"."slack_bot_threads" ("workspace_id", "channel_id", "thread_ts");
CREATE INDEX IF NOT EXISTS "idx_slack_bot_threads_tenant_last"
  ON "public"."slack_bot_threads" ("tenant_id", "last_message_at");

-- Acciones pendientes (confirmaciones / aprobaciones)
CREATE TABLE IF NOT EXISTS "public"."slack_pending_actions" (
  "id"                        TEXT NOT NULL,
  "tenant_id"                 TEXT NOT NULL,
  "workspace_id"              TEXT NOT NULL,
  "kind"                      TEXT NOT NULL,
  "tool_name"                 TEXT,
  "tool_args"                 JSONB,
  "entity_id"                 TEXT,
  "requested_by_slack_user_id" TEXT NOT NULL,
  "channel_id"                TEXT NOT NULL,
  "message_ts"                TEXT,
  "status"                    TEXT NOT NULL DEFAULT 'PENDING',
  "expires_at"                TIMESTAMP(3) NOT NULL,
  "resolved_by"               TEXT,
  "resolved_at"               TIMESTAMP(3),
  "created_at"                TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT "slack_pending_actions_pkey" PRIMARY KEY ("id")
);

CREATE INDEX IF NOT EXISTS "idx_slack_pending_tenant_status"
  ON "public"."slack_pending_actions" ("tenant_id", "status");
CREATE INDEX IF NOT EXISTS "idx_slack_pending_expires"
  ON "public"."slack_pending_actions" ("expires_at");
