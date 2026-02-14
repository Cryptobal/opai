-- Enable pgvector extension (idempotent)
CREATE EXTENSION IF NOT EXISTS vector;

-- Table for storing document chunks with embeddings
CREATE TABLE IF NOT EXISTS "public"."AiDocChunk" (
    "id" TEXT NOT NULL DEFAULT gen_random_uuid()::text,
    "source_path" TEXT NOT NULL,
    "section" TEXT NOT NULL,
    "content" TEXT NOT NULL,
    "content_hash" TEXT NOT NULL,
    "embedding" vector(1536),
    "token_count" INTEGER NOT NULL DEFAULT 0,
    "created_at" TIMESTAMPTZ NOT NULL DEFAULT now(),
    "updated_at" TIMESTAMPTZ NOT NULL DEFAULT now(),

    CONSTRAINT "AiDocChunk_pkey" PRIMARY KEY ("id")
);

-- Indexes
CREATE INDEX IF NOT EXISTS "idx_ai_doc_chunk_source" ON "public"."AiDocChunk"("source_path");
CREATE UNIQUE INDEX IF NOT EXISTS "idx_ai_doc_chunk_hash" ON "public"."AiDocChunk"("content_hash");

-- HNSW index for fast cosine similarity search
CREATE INDEX IF NOT EXISTS "idx_ai_doc_chunk_embedding" ON "public"."AiDocChunk"
    USING hnsw ("embedding" vector_cosine_ops)
    WITH (m = 16, ef_construction = 64);
