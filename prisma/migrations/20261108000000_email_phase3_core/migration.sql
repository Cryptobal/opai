-- Fase 3 núcleo del correo (Prompt D): embeddings, vinculación polimórfica,
-- taxonomía v5 y resúmenes. Migración aditiva (+ backfill barato de mapeo).

-- ── A07: chunks con embeddings (pgvector ya instalado) ──
CREATE TABLE IF NOT EXISTS "crm"."email_chunks" (
  "id" UUID NOT NULL DEFAULT uuid_generate_v4(),
  "tenant_id" TEXT NOT NULL,
  "email_account_id" UUID NOT NULL,
  "thread_id" UUID NOT NULL,
  "message_id" UUID NOT NULL,
  "chunk_index" INTEGER NOT NULL DEFAULT 0,
  "content" TEXT NOT NULL,
  "content_hash" TEXT NOT NULL,
  "embedding" vector(1536),
  "token_count" INTEGER NOT NULL DEFAULT 0,
  "created_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT "email_chunks_pkey" PRIMARY KEY ("id")
);
CREATE UNIQUE INDEX IF NOT EXISTS "uq_crm_email_chunks_message_chunk"
  ON "crm"."email_chunks" ("message_id", "chunk_index");
CREATE INDEX IF NOT EXISTS "idx_crm_email_chunks_tenant_thread"
  ON "crm"."email_chunks" ("tenant_id", "thread_id");
CREATE INDEX IF NOT EXISTS "idx_crm_email_chunks_account"
  ON "crm"."email_chunks" ("email_account_id");
-- HNSW sobre tabla recién creada (vacía): instantáneo acá. Si la versión de
-- pgvector fuera <0.5 (sin hnsw), reemplazar por ivfflat.
CREATE INDEX IF NOT EXISTS "idx_crm_email_chunks_embedding"
  ON "crm"."email_chunks" USING hnsw ("embedding" vector_cosine_ops);

-- ── O01-O04: vinculación polimórfica hilo↔entidad ──
CREATE TABLE IF NOT EXISTS "crm"."email_thread_links" (
  "id" UUID NOT NULL DEFAULT uuid_generate_v4(),
  "tenant_id" TEXT NOT NULL,
  "thread_id" UUID NOT NULL,
  "entity_type" TEXT NOT NULL,
  "entity_id" TEXT NOT NULL,
  "linked_via" TEXT NOT NULL DEFAULT 'manual',
  "created_by" TEXT,
  "created_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT "email_thread_links_pkey" PRIMARY KEY ("id")
);
CREATE UNIQUE INDEX IF NOT EXISTS "uq_crm_email_thread_links"
  ON "crm"."email_thread_links" ("thread_id", "entity_type", "entity_id");
CREATE INDEX IF NOT EXISTS "idx_crm_email_thread_links_entity"
  ON "crm"."email_thread_links" ("tenant_id", "entity_type", "entity_id");
CREATE INDEX IF NOT EXISTS "idx_crm_email_thread_links_thread"
  ON "crm"."email_thread_links" ("thread_id");

-- A07: flag de indexación incremental de embeddings por mensaje.
ALTER TABLE "crm"."email_messages"
  ADD COLUMN IF NOT EXISTS "chunks_indexed" BOOLEAN NOT NULL DEFAULT false;
CREATE INDEX IF NOT EXISTS "idx_crm_email_messages_chunks_pending"
  ON "crm"."email_messages" ("email_account_id")
  WHERE "chunks_indexed" = false;

-- ── A03: taxonomía v5 + A01/A02: resúmenes y última lectura ──
ALTER TABLE "crm"."email_threads"
  ADD COLUMN IF NOT EXISTS "ai_vertical" TEXT,
  ADD COLUMN IF NOT EXISTS "ai_urgency" TEXT,
  ADD COLUMN IF NOT EXISTS "ai_sentiment" TEXT,
  ADD COLUMN IF NOT EXISTS "ai_thread_summary" JSONB,
  ADD COLUMN IF NOT EXISTS "last_read_at" TIMESTAMPTZ(6);

-- Mapeo v4→v5 de lo ya clasificado (documentado en schema.prisma).
UPDATE "crm"."email_threads" SET "ai_vertical" = CASE
    WHEN "ai_category" IN ('cotizacion', 'licitacion', 'consulta_comercial') THEN 'comercial'
    WHEN "ai_category" = 'facturacion' THEN 'finanzas'
    WHEN "ai_category" = 'operacional' THEN 'operaciones'
    WHEN "ai_category" = 'otro' THEN 'otro'
    ELSE NULL
  END
WHERE "ai_category" IS NOT NULL AND "ai_vertical" IS NULL;
