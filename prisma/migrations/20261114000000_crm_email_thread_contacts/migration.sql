-- Copiloto v2: contactos múltiples por hilo (aditivo).
-- CrmEmailThread.contactId se conserva como contacto principal.

CREATE TABLE IF NOT EXISTS "crm"."email_thread_contacts" (
    "id" UUID NOT NULL DEFAULT uuid_generate_v4(),
    "tenant_id" TEXT NOT NULL,
    "thread_id" UUID NOT NULL,
    "contact_id" UUID NOT NULL,
    "added_via" TEXT NOT NULL DEFAULT 'manual',
    "created_by" TEXT,
    "created_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "email_thread_contacts_pkey" PRIMARY KEY ("id")
);

DO $$ BEGIN
  ALTER TABLE "crm"."email_thread_contacts"
    ADD CONSTRAINT "uq_crm_email_thread_contacts" UNIQUE ("thread_id", "contact_id");
EXCEPTION WHEN duplicate_object THEN NULL;
END $$;

CREATE INDEX IF NOT EXISTS "idx_crm_email_thread_contacts_contact"
  ON "crm"."email_thread_contacts"("tenant_id", "contact_id");

CREATE INDEX IF NOT EXISTS "idx_crm_email_thread_contacts_thread"
  ON "crm"."email_thread_contacts"("thread_id");

DO $$ BEGIN
  ALTER TABLE "crm"."email_thread_contacts"
    ADD CONSTRAINT "email_thread_contacts_thread_id_fkey"
    FOREIGN KEY ("thread_id") REFERENCES "crm"."email_threads"("id")
    ON DELETE CASCADE ON UPDATE CASCADE;
EXCEPTION WHEN duplicate_object THEN NULL;
END $$;

DO $$ BEGIN
  ALTER TABLE "crm"."email_thread_contacts"
    ADD CONSTRAINT "email_thread_contacts_contact_id_fkey"
    FOREIGN KEY ("contact_id") REFERENCES "crm"."contacts"("id")
    ON DELETE CASCADE ON UPDATE CASCADE;
EXCEPTION WHEN duplicate_object THEN NULL;
END $$;

-- Backfill idempotente desde el contacto principal del hilo.
INSERT INTO "crm"."email_thread_contacts" ("tenant_id", "thread_id", "contact_id", "added_via")
SELECT t."tenant_id", t."id", t."contact_id", 'backfill'
FROM "crm"."email_threads" t
WHERE t."contact_id" IS NOT NULL
ON CONFLICT ("thread_id", "contact_id") DO NOTHING;
