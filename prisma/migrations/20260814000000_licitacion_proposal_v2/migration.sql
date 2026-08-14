-- Aditiva: texto extraído de archivos CRM, estado/modo de propuesta CPQ,
-- y metadata de conversaciones ancladas. Sin drops ni renames.

-- Texto extraído por archivo (ingesta licitación / knowledge de negocio)
CREATE TABLE IF NOT EXISTS "crm"."file_texts" (
  "id" UUID NOT NULL DEFAULT uuid_generate_v4(),
  "tenant_id" TEXT NOT NULL,
  "file_id" UUID NOT NULL,
  "text" TEXT NOT NULL,
  "token_count" INTEGER NOT NULL DEFAULT 0,
  "status" TEXT NOT NULL DEFAULT 'pending',
  "extracted_at" TIMESTAMPTZ(6),
  "error" TEXT,
  "content_hash" TEXT,
  "created_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updated_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT "file_texts_pkey" PRIMARY KEY ("id")
);

CREATE UNIQUE INDEX IF NOT EXISTS "file_texts_file_id_key"
  ON "crm"."file_texts" ("file_id");

CREATE INDEX IF NOT EXISTS "idx_crm_file_texts_tenant"
  ON "crm"."file_texts" ("tenant_id");

CREATE INDEX IF NOT EXISTS "idx_crm_file_texts_tenant_status"
  ON "crm"."file_texts" ("tenant_id", "status");

ALTER TABLE "crm"."file_texts"
  DROP CONSTRAINT IF EXISTS "file_texts_file_id_fkey";
ALTER TABLE "crm"."file_texts"
  ADD CONSTRAINT "file_texts_file_id_fkey"
  FOREIGN KEY ("file_id") REFERENCES "crm"."files"("id")
  ON DELETE CASCADE ON UPDATE CASCADE;

ALTER TABLE "crm"."file_texts"
  DROP CONSTRAINT IF EXISTS "file_texts_tenant_id_fkey";
ALTER TABLE "crm"."file_texts"
  ADD CONSTRAINT "file_texts_tenant_id_fkey"
  FOREIGN KEY ("tenant_id") REFERENCES "public"."Tenant"("id")
  ON DELETE CASCADE ON UPDATE CASCADE;

-- Estado y modo de la propuesta técnica v2
ALTER TABLE "cpq"."quotes"
  ADD COLUMN IF NOT EXISTS "proposal_status" TEXT;
ALTER TABLE "cpq"."quotes"
  ADD COLUMN IF NOT EXISTS "proposal_mode" TEXT;

-- Metadata de conversación anclada (p. ej. cotización elegida)
ALTER TABLE "public"."AiChatConversation"
  ADD COLUMN IF NOT EXISTS "metadata" JSONB;

