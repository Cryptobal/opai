-- Auditoría de acciones de escritura ejecutadas por el asistente IA.
-- Registra cada create/update/delete que el chatbot intentó, con resultado.
CREATE TABLE IF NOT EXISTS "public"."ai_action_log" (
  "id"                  TEXT PRIMARY KEY,
  "tenant_id"           TEXT NOT NULL,
  "user_id"             TEXT NOT NULL,
  "conversation_id"     TEXT,
  "tool_name"           TEXT NOT NULL,
  "args"                JSONB NOT NULL,
  "status"              TEXT NOT NULL,
  "result_entity_id"    TEXT,
  "result_entity_type"  TEXT,
  "error_message"       TEXT,
  "duration_ms"         INTEGER NOT NULL,
  "created_at"          TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT "ai_action_log_tenant_id_fkey"
    FOREIGN KEY ("tenant_id") REFERENCES "public"."Tenant"("id") ON DELETE CASCADE,
  CONSTRAINT "ai_action_log_user_id_fkey"
    FOREIGN KEY ("user_id") REFERENCES "public"."Admin"("id") ON DELETE CASCADE
);

CREATE INDEX IF NOT EXISTS "idx_ai_action_log_tenant_created"
  ON "public"."ai_action_log" ("tenant_id", "created_at");
CREATE INDEX IF NOT EXISTS "idx_ai_action_log_user_created"
  ON "public"."ai_action_log" ("user_id", "created_at");
CREATE INDEX IF NOT EXISTS "idx_ai_action_log_tool_created"
  ON "public"."ai_action_log" ("tool_name", "created_at");
