-- Frecency de destinatarios por usuario (PR-05, C21a §7). Migración aditiva.

CREATE TABLE IF NOT EXISTS "crm"."email_recipients" (
  "id" UUID NOT NULL DEFAULT uuid_generate_v4(),
  "tenant_id" TEXT NOT NULL,
  "user_id" TEXT NOT NULL,
  "email" TEXT NOT NULL,
  "display_name" TEXT,
  "source" TEXT NOT NULL DEFAULT 'send',
  "send_count" INTEGER NOT NULL DEFAULT 0,
  "first_sent_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "last_sent_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "contact_id" UUID,
  CONSTRAINT "email_recipients_pkey" PRIMARY KEY ("id"),
  CONSTRAINT "email_recipients_contact_id_fkey"
    FOREIGN KEY ("contact_id")
    REFERENCES "crm"."contacts"("id")
    ON DELETE SET NULL
    ON UPDATE CASCADE
);

CREATE UNIQUE INDEX IF NOT EXISTS "uq_crm_email_recipients_user_email"
  ON "crm"."email_recipients" ("tenant_id", "user_id", "email");
CREATE INDEX IF NOT EXISTS "idx_crm_email_recipients_recent"
  ON "crm"."email_recipients" ("tenant_id", "user_id", "last_sent_at" DESC);
CREATE INDEX IF NOT EXISTS "idx_crm_email_recipients_frequent"
  ON "crm"."email_recipients" ("tenant_id", "user_id", "send_count" DESC);
