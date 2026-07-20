-- ──────────────────────────────────────────────────────────────────────
-- Radar Comercial v4 — migración 100% ADITIVA.
--
-- Contenido:
--   1. crm.email_threads: ai_category, ai_intent, ai_summary,
--      ai_classified_at, first_inbound_at, first_reply_at
--   2. crm.radar_items (nueva tabla): alertas accionables del radar
--
-- Sólo ADD COLUMN (nullable) / CREATE TABLE / CREATE INDEX.
-- No hay DROP ni ALTER destructivo, sin backfill de datos.
-- ──────────────────────────────────────────────────────────────────────

-- 1. crm.email_threads — clasificación IA del hilo ─────────────────────
ALTER TABLE "crm"."email_threads"
  ADD COLUMN IF NOT EXISTS "ai_category"      TEXT,
  ADD COLUMN IF NOT EXISTS "ai_intent"        TEXT,
  ADD COLUMN IF NOT EXISTS "ai_summary"       TEXT,
  ADD COLUMN IF NOT EXISTS "ai_classified_at" TIMESTAMPTZ(6),
  ADD COLUMN IF NOT EXISTS "first_inbound_at" TIMESTAMPTZ(6),
  ADD COLUMN IF NOT EXISTS "first_reply_at"   TIMESTAMPTZ(6);

-- 2. crm.radar_items — alertas accionables del radar comercial ─────────
CREATE TABLE IF NOT EXISTS "crm"."radar_items" (
  "id"         TEXT NOT NULL,
  "tenant_id"  TEXT NOT NULL,
  "user_id"    TEXT NOT NULL,
  "kind"       TEXT NOT NULL,
  "status"     TEXT NOT NULL DEFAULT 'PENDING',
  "title"      TEXT NOT NULL,
  "summary"    TEXT,
  "thread_id"  TEXT,
  "deal_id"    TEXT,
  "account_id" TEXT,
  "due_at"     TIMESTAMPTZ(6),
  "dedupe_key" TEXT,
  "payload"    JSONB,
  "created_at" TIMESTAMPTZ(6) NOT NULL DEFAULT now(),
  "updated_at" TIMESTAMPTZ(6) NOT NULL,
  CONSTRAINT "radar_items_pkey" PRIMARY KEY ("id")
);

-- Upsert idempotente por (tenant, dedupeKey). NULL dedupe_key no colisiona.
CREATE UNIQUE INDEX IF NOT EXISTS "uq_radar_items_tenant_dedupe"
  ON "crm"."radar_items" ("tenant_id", "dedupe_key");
-- Feed del hub: PENDING del usuario por tenant, ordenado por fecha.
CREATE INDEX IF NOT EXISTS "idx_radar_items_tenant_user_status"
  ON "crm"."radar_items" ("tenant_id", "user_id", "status", "created_at");
