-- Email dead letter queue: persists emails that failed all retries
CREATE TABLE IF NOT EXISTS "crm"."email_dead_letters" (
  "id"            UUID NOT NULL DEFAULT uuid_generate_v4(),
  "tenant_id"     TEXT NOT NULL,
  "purpose"       TEXT NOT NULL,
  "ref_id"        TEXT,
  "payload"       JSONB NOT NULL,
  "error_message" TEXT NOT NULL,
  "retry_count"   INTEGER NOT NULL DEFAULT 0,
  "resolved"      BOOLEAN NOT NULL DEFAULT FALSE,
  "created_at"    TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  "resolved_at"   TIMESTAMPTZ,
  CONSTRAINT "email_dead_letters_pkey" PRIMARY KEY ("id")
);

CREATE INDEX IF NOT EXISTS "idx_email_deadletter_tenant_resolved"
  ON "crm"."email_dead_letters" ("tenant_id", "resolved");

CREATE INDEX IF NOT EXISTS "idx_email_deadletter_created_desc"
  ON "crm"."email_dead_letters" ("created_at" DESC);
