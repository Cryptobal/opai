-- Cola de emails fallidos (3 intentos sin éxito vía sendEmailWithRetry).
CREATE TABLE "crm"."email_dead_letters" (
  "id"            UUID         NOT NULL DEFAULT uuid_generate_v4(),
  "tenant_id"     TEXT         NOT NULL,
  "purpose"       TEXT         NOT NULL,
  "ref_id"        TEXT,
  "payload"       JSONB        NOT NULL,
  "error_message" TEXT         NOT NULL,
  "retry_count"   INTEGER      NOT NULL DEFAULT 0,
  "resolved"      BOOLEAN      NOT NULL DEFAULT false,
  "created_at"    TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "resolved_at"   TIMESTAMPTZ(6),
  CONSTRAINT "email_dead_letters_pkey" PRIMARY KEY ("id")
);

CREATE INDEX "idx_email_deadletter_tenant_resolved"
  ON "crm"."email_dead_letters" ("tenant_id", "resolved");

CREATE INDEX "idx_email_deadletter_created_desc"
  ON "crm"."email_dead_letters" ("created_at" DESC);
