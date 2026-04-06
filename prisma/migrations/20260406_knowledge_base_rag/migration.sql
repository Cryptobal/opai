-- Enable pgvector extension (idempotent)
CREATE EXTENSION IF NOT EXISTS vector;

-- CreateTable: knowledge_bases
CREATE TABLE "public"."knowledge_bases" (
    "id" TEXT NOT NULL,
    "tenant_id" TEXT,
    "title" TEXT NOT NULL,
    "description" TEXT,
    "file_name" TEXT NOT NULL,
    "file_url" TEXT NOT NULL,
    "file_size" INTEGER NOT NULL,
    "mime_type" TEXT NOT NULL,
    "status" TEXT NOT NULL DEFAULT 'processing',
    "chunk_count" INTEGER NOT NULL DEFAULT 0,
    "category" TEXT,
    "enabled" BOOLEAN NOT NULL DEFAULT true,
    "metadata" JSONB,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,
    "created_by" TEXT,

    CONSTRAINT "knowledge_bases_pkey" PRIMARY KEY ("id")
);

-- CreateTable: knowledge_chunks
CREATE TABLE "public"."knowledge_chunks" (
    "id" TEXT NOT NULL,
    "knowledge_base_id" TEXT NOT NULL,
    "content" TEXT NOT NULL,
    "chunk_index" INTEGER NOT NULL,
    "embedding" vector(1536),
    "token_count" INTEGER NOT NULL DEFAULT 0,
    "metadata" JSONB,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "knowledge_chunks_pkey" PRIMARY KEY ("id")
);

-- CreateIndex: knowledge_bases
CREATE INDEX "knowledge_bases_tenant_id_idx" ON "public"."knowledge_bases"("tenant_id");
CREATE INDEX "knowledge_bases_tenant_id_enabled_idx" ON "public"."knowledge_bases"("tenant_id", "enabled");

-- CreateIndex: knowledge_chunks
CREATE INDEX "knowledge_chunks_knowledge_base_id_idx" ON "public"."knowledge_chunks"("knowledge_base_id");

-- Vector similarity search index (IVFFlat for cosine distance)
CREATE INDEX "knowledge_chunks_embedding_idx" ON "public"."knowledge_chunks"
  USING ivfflat (embedding vector_cosine_ops) WITH (lists = 100);

-- AddForeignKey: knowledge_bases -> tenants
ALTER TABLE "public"."knowledge_bases"
  ADD CONSTRAINT "knowledge_bases_tenant_id_fkey"
  FOREIGN KEY ("tenant_id") REFERENCES "public"."Tenant"("id")
  ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey: knowledge_chunks -> knowledge_bases
ALTER TABLE "public"."knowledge_chunks"
  ADD CONSTRAINT "knowledge_chunks_knowledge_base_id_fkey"
  FOREIGN KEY ("knowledge_base_id") REFERENCES "public"."knowledge_bases"("id")
  ON DELETE CASCADE ON UPDATE CASCADE;
