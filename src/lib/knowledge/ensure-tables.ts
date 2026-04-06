/**
 * Garantiza que existan tablas e índices de RAG (knowledge_bases / knowledge_chunks).
 * Si el deploy llegó antes que `prisma migrate deploy` en un entorno, el primer request
 * crea el esquema de forma idempotente (misma SQL que migración 20260406_knowledge_base_rag).
 */
import { prisma } from '@/lib/prisma';

let ensurePromise: Promise<void> | null = null;

export async function ensureKnowledgeTables(): Promise<void> {
  if (!ensurePromise) {
    ensurePromise = runEnsure().catch((err) => {
      ensurePromise = null;
      throw err;
    });
  }
  await ensurePromise;
}

async function runEnsure(): Promise<void> {
  await prisma.$executeRawUnsafe(`CREATE EXTENSION IF NOT EXISTS vector`);

  await prisma.$executeRawUnsafe(`
CREATE TABLE IF NOT EXISTS "public"."knowledge_bases" (
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
    "updated_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "created_by" TEXT,
    CONSTRAINT "knowledge_bases_pkey" PRIMARY KEY ("id")
)`);

  await prisma.$executeRawUnsafe(`
CREATE TABLE IF NOT EXISTS "public"."knowledge_chunks" (
    "id" TEXT NOT NULL,
    "knowledge_base_id" TEXT NOT NULL,
    "content" TEXT NOT NULL,
    "chunk_index" INTEGER NOT NULL,
    "embedding" vector(1536),
    "token_count" INTEGER NOT NULL DEFAULT 0,
    "metadata" JSONB,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT "knowledge_chunks_pkey" PRIMARY KEY ("id")
)`);

  await prisma.$executeRawUnsafe(
    `CREATE INDEX IF NOT EXISTS "knowledge_bases_tenant_id_idx" ON "public"."knowledge_bases"("tenant_id")`,
  );
  await prisma.$executeRawUnsafe(
    `CREATE INDEX IF NOT EXISTS "knowledge_bases_tenant_id_enabled_idx" ON "public"."knowledge_bases"("tenant_id", "enabled")`,
  );
  await prisma.$executeRawUnsafe(
    `CREATE INDEX IF NOT EXISTS "knowledge_chunks_knowledge_base_id_idx" ON "public"."knowledge_chunks"("knowledge_base_id")`,
  );

  await prisma.$executeRawUnsafe(`
DO $$ BEGIN
  BEGIN
    ALTER TABLE "public"."knowledge_bases"
      ADD CONSTRAINT "knowledge_bases_tenant_id_fkey"
      FOREIGN KEY ("tenant_id") REFERENCES "public"."Tenant"("id")
      ON DELETE CASCADE ON UPDATE CASCADE;
  EXCEPTION
    WHEN duplicate_object THEN NULL;
  END;
END $$`);

  await prisma.$executeRawUnsafe(`
DO $$ BEGIN
  BEGIN
    ALTER TABLE "public"."knowledge_chunks"
      ADD CONSTRAINT "knowledge_chunks_knowledge_base_id_fkey"
      FOREIGN KEY ("knowledge_base_id") REFERENCES "public"."knowledge_bases"("id")
      ON DELETE CASCADE ON UPDATE CASCADE;
  EXCEPTION
    WHEN duplicate_object THEN NULL;
  END;
END $$`);

  try {
    await prisma.$executeRawUnsafe(`
CREATE INDEX IF NOT EXISTS "knowledge_chunks_embedding_idx" ON "public"."knowledge_chunks"
  USING ivfflat (embedding vector_cosine_ops) WITH (lists = 100)`);
  } catch (e) {
    console.warn(
      '[ensureKnowledgeTables] No se pudo crear índice ivfflat en knowledge_chunks (búsqueda vectorial puede ser más lenta):',
      e,
    );
  }
}
